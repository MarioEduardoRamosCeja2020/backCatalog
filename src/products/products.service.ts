
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { SupabaseService } from '../supabase.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UploadedImageFile } from './uploaded-image.interface';

const BUCKET = 'parchisCatalog';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

@Injectable()
export class ProductsService {
  private readonly table = 'products';

  constructor(private readonly supabaseService: SupabaseService) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  private generateSlug(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private validateImage(file?: UploadedImageFile): void {
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException(
        'La imagen no puede superar los 5 MB.',
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato no permitido. Usa JPG, PNG, WEBP o GIF.',
      );
    }
  }

  private async uploadImage(file: UploadedImageFile) {
    this.validateImage(file);

    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };

    const path = `products/${randomUUID()}.${extensions[file.mimetype]}`;

    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `No se pudo subir la imagen: ${error.message}`,
      );
    }

    const { data } = this.client.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return {
      image_url: data.publicUrl,
      image_public_id: path,
    };
  }

  private async deleteImage(path?: string | null): Promise<void> {
    if (!path) return;

    const { error } = await this.client.storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      throw new Error(
        `No se pudo eliminar la imagen ${path}: ${error.message}`,
      );
    }
  }

  async findAll() {
    const { data, error } = await this.client
      .from(this.table)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.client
      .from(this.table)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Producto no encontrado');
    }

    return data;
  }

  async create(
    createProductDto: CreateProductDto,
    image?: UploadedImageFile,
  ) {
    this.validateImage(image);

    if (!createProductDto.name?.trim()) {
      throw new BadRequestException('El nombre es obligatorio.');
    }

    if (
      !Number.isFinite(Number(createProductDto.price)) ||
      Number(createProductDto.price) < 0
    ) {
      throw new BadRequestException('El precio no es válido.');
    }

    let uploadedImage:
      | { image_url: string; image_public_id: string }
      | undefined;

    try {
      if (image) {
        uploadedImage = await this.uploadImage(image);
      }

      const product = {
        ...createProductDto,
        slug: this.generateSlug(createProductDto.name),
        ...(uploadedImage ?? {}),
      };

      const { data, error } = await this.client
        .from(this.table)
        .insert(product)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      if (uploadedImage) {
        try {
          await this.deleteImage(uploadedImage.image_public_id);
        } catch (cleanupError) {
          console.error(
            'No se pudo limpiar la imagen del alta fallida:',
            cleanupError,
          );
        }
      }

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'No se pudo crear el producto.',
      );
    }
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    image?: UploadedImageFile,
  ) {
    const current = await this.findOne(id);
    this.validateImage(image);

    let uploadedImage:
      | { image_url: string; image_public_id: string }
      | undefined;

    try {
      if (image) {
        uploadedImage = await this.uploadImage(image);
      }

      const changes: Record<string, unknown> = {
        ...updateProductDto,
        updated_at: new Date().toISOString(),
      };

      if (updateProductDto.name) {
        changes.slug = this.generateSlug(updateProductDto.name);
      }

      if (uploadedImage) {
        changes.image_url = uploadedImage.image_url;
        changes.image_public_id = uploadedImage.image_public_id;
      }

      const { data, error } = await this.client
        .from(this.table)
        .update(changes)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      // La base de datos ya apunta a la nueva imagen.
      // Ahora intentamos retirar la anterior.
      if (
        uploadedImage &&
        current.image_public_id &&
        current.image_public_id !== uploadedImage.image_public_id
      ) {
        try {
          await this.deleteImage(current.image_public_id);
        } catch (cleanupError) {
          console.error(
            'No se pudo eliminar la imagen anterior:',
            cleanupError,
          );
        }
      }

      return data;
    } catch (error) {
      if (uploadedImage) {
        try {
          await this.deleteImage(uploadedImage.image_public_id);
        } catch (cleanupError) {
          console.error(
            'No se pudo limpiar la imagen nueva tras el fallo:',
            cleanupError,
          );
        }
      }

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el producto.',
      );
    }
  }

  async remove(id: string) {
    const current = await this.findOne(id);

    const { error } = await this.client
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    let imageCleanupPending = false;

    if (current.image_public_id) {
      try {
        await this.deleteImage(current.image_public_id);
      } catch (cleanupError) {
        imageCleanupPending = true;
        console.error(
          'Producto eliminado; imagen pendiente de limpieza:',
          cleanupError,
        );
      }
    }

    return {
      message: 'Producto eliminado correctamente',
      imageCleanupPending,
    };
  }
}