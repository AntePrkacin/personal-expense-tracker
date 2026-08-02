import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { ApiErrorResponse } from './common/decorators/api-error-response.decorator';
import { HelloResponseDto } from './dto/hello-response.dto';

@ApiTags('meta')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // With the global 'api' prefix (see main.ts), this is GET /api/hello.
  @Get('hello')
  @ApiOperation({
    summary: 'A greeting, and the proof that the two apps can talk.',
  })
  @ApiOkResponse({ type: HelloResponseDto })
  @ApiErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR)
  getHello(): HelloResponseDto {
    return this.appService.getHello();
  }
}
