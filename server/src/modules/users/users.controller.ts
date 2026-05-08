import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  @Roles('ADMIN')
  findAll(@CurrentUser('orgId') orgId: string) {
    return this.service.findAll(orgId);
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.findOne(id, orgId);
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser('orgId') orgId: string, @Body() dto: CreateUserDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @CurrentUser('orgId') orgId: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deactivate(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.service.deactivate(id, orgId);
  }
}
