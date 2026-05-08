import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private service: ContractsService) {}

  @Get()
  findAll(@CurrentUser('orgId') orgId: string, @Query() query: any) {
    return this.service.findAll(orgId, query);
  }

  @Get('expiring')
  expiring(@CurrentUser('orgId') orgId: string, @Query('days') days?: number) {
    return this.service.getExpiringContracts(orgId, days);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.findOne(id, orgId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@CurrentUser('orgId') orgId: string, @Body() dto: CreateContractDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id') id: string, @CurrentUser('orgId') orgId: string, @Body() dto: UpdateContractDto) {
    return this.service.update(id, orgId, dto);
  }

  @Delete(':id/terminate')
  @Roles('ADMIN', 'MANAGER')
  terminate(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.terminate(id, orgId);
  }
}
