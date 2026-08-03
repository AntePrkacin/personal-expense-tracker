import { Injectable } from '@nestjs/common';
import { HelloResponseDto } from './dto/hello-response.dto';

@Injectable()
export class AppService {
  getHello(): HelloResponseDto {
    return { message: 'Welcome friend, hello from the NestJS API 👋' };
  }
}
