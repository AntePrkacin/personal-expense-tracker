import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
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
  // No 500 here, and none on any other operation: every route can answer 500
  // through the global filter, so documenting it per operation restates the
  // same non-actionable fact everywhere and widens every generated response
  // union. The document description says it once instead.
  @ApiOkResponse({ type: HelloResponseDto })
  getHello(): HelloResponseDto {
    return this.appService.getHello();
  }
}
