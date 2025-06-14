import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUserDto } from './dto/filter-user.dto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import {
  getPaginationParams,
  buildPaginatedResponse,
} from '../common/utils/pagination.util';
import { UserValidationService } from './usersValidate.service';

const userSelectWithoutPassword: Prisma.UserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: UserValidationService,
  ) {}

  async create(dto: CreateUserDto) {
    await this.validationService.validateUserFields(dto);

    const hash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        ...dto,
        password: hash,
        status: 'ACTIVE',
      },
    });
  }

  async update(id: number, dto: UpdateUserDto, user: any) {
    if (user.role !== 'ADMIN' && user.id !== id) {
      throw new ForbiddenException(
        'You do not have permission to update this user',
      );
    }

    const existingUser = await this.validationService.getUserOrFail(id);

    await this.validationService.validateUserFields(dto);

    let password = existingUser.password;
    if (dto.password) {
      password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...dto,
        password,
        updatedAt: new Date(),
      },
    });
  }

  async findAll(filter: FilterUserDto) {
    const page = parseInt(filter.page?.toString() || '1', 10);
    const limit = parseInt(filter.limit?.toString() || '10', 10);

    const { skip, take } = getPaginationParams({ page, limit });

    const where: Prisma.UserWhereInput = {};

    if (filter.name) {
      where.name = { contains: filter.name };
    }

    if (filter.email) {
      where.email = { contains: filter.email };
    }

    if (filter.status) {
      where.status = filter.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        select: userSelectWithoutPassword,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const user = await this.validationService.getUserOrFail(
      id,
      userSelectWithoutPassword,
    );
    return user;
  }

  async softDelete(id: number) {
    const user = await this.validationService.getUserOrFail(id);

    await this.validationService.ensureUserIsActive(user);

    return this.prisma.user.update({
      where: { id },
      data: {
        status: 'INACTIVE',
        updatedAt: new Date(),
      },
      select: userSelectWithoutPassword,
    });
  }
}
