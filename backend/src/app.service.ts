import { Injectable } from '@nestjs/common';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class AppService {
  getHealth(): HealthResponseDto {
    return { status: 'ok' };
  }
}
