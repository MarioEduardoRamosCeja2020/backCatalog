
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el archivo .env',
      );
    }

    this.client = createClient(url, key);
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}