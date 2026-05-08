import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private service: MaintenanceService) {}

  @Get()
  findAll(@CurrentUser('orgId') orgId: string, @Query() query: any) {
    return this.service.findAll(orgId, query);
  }

  @Get('stats')
  stats(@CurrentUser('orgId') orgId: string) {
    return this.service.getStats(orgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.findOne(id, orgId);
  }

  @Post()
  create(@CurrentUser('orgId') orgId: string, @Body() dto: CreateTicketDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('orgId') orgId: string, @Body() dto: UpdateTicketDto) {
    return this.service.update(id, orgId, dto);
  }

  @Post(':id/photos')
  addPhoto(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body('url') url: string,
  ) {
    return this.service.addPhoto(id, orgId, url);
  }
}
