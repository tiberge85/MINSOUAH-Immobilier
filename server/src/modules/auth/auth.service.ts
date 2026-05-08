import {
  Injectable, UnauthorizedException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Cet email est déjà utilisé');

    // Créer l'organisation si nécessaire
    let org = await this.prisma.organization.findFirst({ where: { slug: dto.email.split('@')[0] } });
    if (!org) {
      org = await this.prisma.organization.create({
        data: {
          name: dto.orgName || `Organisation de ${dto.firstName}`,
          slug: `org-${Date.now()}`,
        },
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        orgId: org.id,
        role: 'ADMIN',
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, orgId: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.orgId);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { org: { select: { id: true, name: true, plan: true } } },
    });
    if (!user) throw new UnauthorizedException('Email ou mot de passe incorrect');
    if (!user.isActive) throw new UnauthorizedException('Compte désactivé');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Email ou mot de passe incorrect');

    // 2FA check
    if (user.twoFaEnabled) {
      if (!dto.totpCode) throw new BadRequestException('Code 2FA requis');
      const { authenticator } = await import('otplib');
      const isValid = authenticator.verify({ token: dto.totpCode, secret: user.twoFaSecret });
      if (!isValid) throw new UnauthorizedException('Code 2FA invalide');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.orgId);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role: user.role, orgId: user.orgId,
        avatarUrl: user.avatarUrl, org: user.org,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.refreshToken) throw new UnauthorizedException();

      const tokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!tokenValid) throw new UnauthorizedException('Token invalide');

      const tokens = await this.generateTokens(user.id, user.email, user.role, user.orgId);
      await this.saveRefreshToken(user.id, tokens.refreshToken);
      return tokens;
    } catch {
      throw new UnauthorizedException('Session expirée, veuillez vous reconnecter');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    return { message: 'Déconnecté avec succès' };
  }

  private async generateTokens(userId: string, email: string, role: string, orgId: string) {
    const payload = { sub: userId, email, role, orgId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.secret'),
        expiresIn: this.config.get('jwt.expiresIn'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiresIn'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const hashed = await bcrypt.hash(token, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: hashed } });
  }
}
