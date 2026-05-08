import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { orgId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, createdAt: true, lastLogin: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, orgId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, phone: true, isActive: true, createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(orgId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email déjà utilisé');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { ...dto, password: passwordHash, orgId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, createdAt: true,
      },
    });
  }

  async update(id: string, orgId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({ where: { id, orgId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const data: any = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true,
      },
    });
  }

  async deactivate(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, orgId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  async updateRefreshToken(id: string, token: string | null) {
    await this.prisma.user.update({ where: { id }, data: { refreshToken: token } });
  }

  async updateLastLogin(id: string) {
    await this.prisma.user.update({ where: { id }, data: { lastLogin: new Date() } });
  }
}
