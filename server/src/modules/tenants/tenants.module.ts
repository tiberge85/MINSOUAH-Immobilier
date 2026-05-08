import { Module } from '@nestjs/common';
import { TenantsController, TenantPortalController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController, TenantPortalController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
