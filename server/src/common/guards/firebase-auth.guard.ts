import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from '../../modules/firebase/firebase.service';
import { UsersService } from '../../modules/users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Allow public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Token manquant');

    const decoded = await this.firebase.verifyIdToken(token);
    if (!decoded) throw new UnauthorizedException('Token invalide ou expiré');

    // Attach user from DB to request
    const user = await this.users.findByFirebaseUid(decoded.uid)
      .catch(() => null);

    if (!user) throw new UnauthorizedException('Utilisateur introuvable');
    req.user = user;
    return true;
  }

  private extractToken(req: Request): string | null {
    const header = (req.headers as Record<string, string>)['authorization'];
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7);
  }
}
