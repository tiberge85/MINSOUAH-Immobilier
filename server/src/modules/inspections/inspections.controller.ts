import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  Query, Request, HttpCode, HttpStatus, Ip,
} from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { UpdateInspectionDto } from './dto/update-inspection.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateDamageDto } from './dto/create-damage.dto';
import { SignInspectionDto } from './dto/sign-inspection.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, InspectionStatus } from '@prisma/client';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly service: InspectionsService) {}

  // ── Inspections CRUD ─────────────────────────────────────────────────────

  @Get()
  findAll(
    @Request() req,
    @Query('status') status?: InspectionStatus,
    @Query('unitId') unitId?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.service.findAll(req.user.orgId, { status, unitId, tenantId });
  }

  @Get('stats')
  getStats(@Request() req) {
    return this.service.getStats(req.user.orgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.service.findOne(id, req.user.orgId);
  }

  @Get(':id/comparison')
  compare(@Param('id') id: string, @Request() req) {
    return this.service.compareInspections(id, req.user.orgId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateInspectionDto, @Request() req) {
    return this.service.create(req.user.orgId, req.user.id, dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateInspectionDto, @Request() req) {
    return this.service.update(id, req.user.orgId, dto);
  }

  @Patch(':id/submit')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  submit(@Param('id') id: string, @Request() req) {
    return this.service.submit(id, req.user.orgId);
  }

  @Patch(':id/validate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  validate(@Param('id') id: string, @Request() req) {
    return this.service.managerValidate(id, req.user.orgId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Request() req) {
    return this.service.remove(id, req.user.orgId);
  }

  // ── Signatures ───────────────────────────────────────────────────────────

  @Post(':id/sign/manager')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  signManager(@Param('id') id: string, @Body() dto: SignInspectionDto, @Request() req, @Ip() ip: string) {
    return this.service.signAsManager(id, req.user.orgId, req.user.id, ip, dto);
  }

  @Post(':id/sign/tenant')
  signTenant(@Param('id') id: string, @Body() dto: SignInspectionDto, @Request() req, @Ip() ip: string) {
    return this.service.signAsTenant(id, req.user.orgId, req.user.id, ip, dto);
  }

  // ── Items ────────────────────────────────────────────────────────────────

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: CreateItemDto, @Request() req) {
    return this.service.addItem(id, req.user.orgId, dto);
  }

  @Put(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateItemDto, @Request() req) {
    return this.service.updateItem(itemId, req.user.orgId, dto);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(@Param('itemId') itemId: string, @Request() req) {
    return this.service.removeItem(itemId, req.user.orgId);
  }

  @Post(':id/items/:itemId/photos')
  addPhoto(
    @Param('itemId') itemId: string,
    @Body() body: { url: string; storagePath?: string; caption?: string },
    @Request() req,
  ) {
    return this.service.addPhoto(itemId, req.user.orgId, body.url, body.storagePath, body.caption);
  }

  @Delete(':id/items/:itemId/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePhoto(@Param('photoId') photoId: string, @Request() req) {
    return this.service.removePhoto(photoId, req.user.orgId);
  }

  // ── Damages ──────────────────────────────────────────────────────────────

  @Post(':id/damages')
  addDamage(@Param('id') id: string, @Body() dto: CreateDamageDto, @Request() req) {
    return this.service.addDamage(id, req.user.orgId, dto);
  }

  @Delete(':id/damages/:damageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDamage(@Param('damageId') damageId: string, @Request() req) {
    return this.service.removeDamage(damageId, req.user.orgId);
  }
}
