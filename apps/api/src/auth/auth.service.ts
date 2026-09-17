import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';

export interface SignupResponse {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
}
