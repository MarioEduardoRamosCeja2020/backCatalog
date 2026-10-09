
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UploadedImageFile } from './uploaded-image.interface';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

function normalizeMultipartBody(body: Record<string, unknown>) {
  const result = { ...body };

  // Estas columnas solo se modifican desde el backend.
  delete result.image;
  delete result.image_url;
  delete result.image_public_id;

  for (const key of ['price', 'stock']) {
    if (result[key] !== undefined && result[key] !== '') {
      result[key] = Number(result[key]);
    }
  }

  for (const key of ['active', 'featured']) {
    if (result[key] !== undefined) {
      result[key] =
        result[key] === true || result[key] === 'true';
    }
  }

  return result;
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: MAX_IMAGE_SIZE,
        files: 1,
      },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Formato no permitido. Usa JPG, PNG, WEBP o GIF.',
            ),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() image?: UploadedImageFile,
  ) {
    return this.productsService.create(
      normalizeMultipartBody(body) as unknown as CreateProductDto,
      image,
    );
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: MAX_IMAGE_SIZE,
        files: 1,
      },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Formato no permitido. Usa JPG, PNG, WEBP o GIF.',
            ),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() image?: UploadedImageFile,
  ) {
    return this.productsService.update(
      id,
      normalizeMultipartBody(body) as unknown as UpdateProductDto,
      image,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}