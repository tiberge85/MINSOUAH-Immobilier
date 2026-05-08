import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BuildingsService } from './buildings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Biens — Immeubles')
@ApiBearerAuth()
@Controller('buildings')
export class BuildingsController {
  constructor(private service: BuildingsService) {}

  @Get()
  findAll(@CurrentUser('orgId') orgId: string, @Query() query: any) {
    return this.service.findAll(orgId, query);
  }

  @Get('stats')
  stats(@CurrentUser('orgId') orgId: string) {
    return this.service.stats(orgId);
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
