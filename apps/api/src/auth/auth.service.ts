import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

export interface SignupResponse {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CurrentUserResponse {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  getTestMessage(): { message: string } {
    return { message: 'Auth module working' };
  }

  async signup(data: SignupDto): Promise<SignupResponse> {
    if (
      !data ||
      typeof data.name !== 'string' ||
      typeof data.email !== 'string' ||
      typeof data.password !== 'string' ||
      data.name.trim() === '' ||
      data.email.trim() === '' ||
      data.password === ''
    ) {
      throw new BadRequestException(
        'Name, email, and password are required',
      );
    }

    const name = data.name.trim();
    const email = data.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    try {
      const user = await this.prisma.user.create({
        data: { name, email, passwordHash },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }

      throw error;
    }
  }

  async login(data: LoginDto): Promise<LoginResponse> {
      const invalidCredentials = new UnauthorizedException(
        'Invalid email or password',
      );

      if (
        !data ||
        typeof data.email !== 'string' ||
        typeof data.password !== 'string' ||
        data.email.trim() === '' ||
        data.password === ''
      ) {
        throw invalidCredentials;
      }

      const email = data.email.trim().toLowerCase();
      const user = await this.prisma.user.findUnique({ where: { email } });

      if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
        throw invalidCredentials;
      }

      const accessToken = await this.jwtService.signAsync({
        sub: user.id,
        email: user.email,
      });

      return {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      };
    }

    async getCurrentUser(userId: string): Promise<CurrentUserResponse> {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Authenticated user no longer exists');
      }

      return user;
    }
}
