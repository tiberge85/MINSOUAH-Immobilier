import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Locataires')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private service: TenantsService) {}

  @Get()
  findAll(@CurrentUser('orgId') orgId: string, @Query() query: any) {
    return this.service.findAll(orgId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.findOne(id, orgId);
  }

  @Post()
  create(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.service.update(id, orgId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.remove(id, orgId);
  }
}

@ApiTags('Portail Locataire')
@Controller('portal/tenant')
export class TenantPortalController {
  constructor(private service: TenantsService) {}

  @Public()
  @Get(':token')
  getPortal(@Param('token') token: string) {
    return this.service.findByPortalToken(token);
  }
}
