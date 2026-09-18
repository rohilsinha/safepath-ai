import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AuthService,
  CurrentUserResponse,
  LoginResponse,
  SignupResponse,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from './guards/jwt-auth.guard';

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

  @Post('login')
  login(@Body() data: LoginDto): Promise<LoginResponse> {
    return this.authService.login(data);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest): Promise<CurrentUserResponse> {
    return this.authService.getCurrentUser(request.user!.sub);
  }
}
