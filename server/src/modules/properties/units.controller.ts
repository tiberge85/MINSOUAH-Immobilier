import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Biens — Unités')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private service: UnitsService) {}

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.findOne(id, orgId);
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
