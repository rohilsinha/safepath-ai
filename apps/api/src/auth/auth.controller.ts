import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService, SignupResponse } from './auth.service';
import { SignupDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('test')
  getTest(): { message: string } {
    return this.authService.getTestMessage();
  }

  @Post('signup')
  signup(@Body() data: SignupDto): Promise<SignupResponse> {
    return this.authService.signup(data);
  }
}
