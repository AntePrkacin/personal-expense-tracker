import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('meta')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // With the global 'api' prefix (see main.ts), this is GET /api/health.
  @Get('health')
  @Public()
  @ApiOperation({
    summary: 'Liveness check: constant 200, no auth, no database.',
  })
  // No 500 here, and none on any other operation: every route can answer 500
  // through the global filter, so documenting it per operation restates the
  // same non-actionable fact everywhere and widens every generated response
  // union. The document description says it once instead.
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return this.appService.getHealth();
  }
}
