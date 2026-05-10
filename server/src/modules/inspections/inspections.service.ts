import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InspectionStatus } from '@prisma/client';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { UpdateInspectionDto } from './dto/update-inspection.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateDamageDto } from './dto/create-damage.dto';
import { SignInspectionDto } from './dto/sign-inspection.dto';

@Injectable()
export class InspectionsService {
  constructor(private prisma: PrismaService) {}

  // ── Inspections ──────────────────────────────────────────────────────────

  async findAll(orgId: string, filters?: { status?: InspectionStatus; unitId?: string; tenantId?: string }) {
    return this.prisma.inspection.findMany({
      where: {
        orgId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.unitId && { unitId: filters.unitId }),
        ...(filters?.tenantId && { tenantId: filters.tenantId }),
      },
      include: {
        unit: { include: { building: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, phone: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { items: true, damages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id, orgId },
      include: {
        unit: { include: { building: true } },
        tenant: true,
        contract: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        items: {
          include: { photos: true },
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
        },
        damages: true,
        report: true,
        entryInspection: {
          include: {
            items: { include: { photos: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] },
          },
        },
      },
    });
    if (!inspection) throw new NotFoundException('Inspection non trouvée');
    return inspection;
  }

  async create(orgId: string, createdById: string, dto: CreateInspectionDto) {
    return this.prisma.inspection.create({
      data: {
        orgId,
        createdById,
        contractId: dto.contractId,
        unitId: dto.unitId,
        tenantId: dto.tenantId,
        type: dto.type,
        scheduledDate: new Date(dto.scheduledDate),
        notes: dto.notes,
        entryInspectionId: dto.entryInspectionId,
        status: InspectionStatus.DRAFT,
      },
      include: { unit: { include: { building: true } }, tenant: true },
    });
  }

  async update(id: string, orgId: string, dto: UpdateInspectionDto) {
    await this.findOne(id, orgId);
    return this.prisma.inspection.update({
      where: { id },
      data: {
        ...(dto.scheduledDate && { scheduledDate: new Date(dto.scheduledDate) }),
        ...(dto.conductedDate && { conductedDate: new Date(dto.conductedDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.generalCondition !== undefined && { generalCondition: dto.generalCondition }),
        ...(dto.status && { status: dto.status }),
      },
    });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.inspection.delete({ where: { id } });
  }

  async submit(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.inspection.update({
      where: { id },
      data: { status: InspectionStatus.PENDING_MANAGER_VALIDATION },
    });
  }

  async managerValidate(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.inspection.update({
      where: { id },
      data: { status: InspectionStatus.PENDING_TENANT_SIGNATURE },
    });
  }

  // ── Electronic Signature ─────────────────────────────────────────────────

  async signAsManager(id: string, orgId: string, userId: string, ipAddress: string, dto: SignInspectionDto) {
    const inspection = await this.findOne(id, orgId);
    if (inspection.createdById !== userId) throw new ForbiddenException('Seul le gestionnaire responsable peut signer');
    return this.prisma.inspection.update({
      where: { id },
      data: {
        managerSignatureData: { data: dto.signatureData, userId, ip: ipAddress },
        managerSignedAt: new Date(),
        managerSignedIp: ipAddress,
        status: InspectionStatus.PENDING_TENANT_SIGNATURE,
      },
    });
  }

  async signAsTenant(id: string, orgId: string, tenantId: string, ipAddress: string, dto: SignInspectionDto) {
    const inspection = await this.findOne(id, orgId);
    if (inspection.tenantId !== tenantId) throw new ForbiddenException('Signature non autorisée');
    if (inspection.status !== InspectionStatus.PENDING_TENANT_SIGNATURE) {
      throw new ForbiddenException("L'état des lieux n'est pas prêt pour signature locataire");
    }
    return this.prisma.inspection.update({
      where: { id },
      data: {
        tenantSignatureData: { data: dto.signatureData, tenantId, ip: ipAddress },
        tenantSignedAt: new Date(),
        tenantSignedIp: ipAddress,
        tenantConsentText: dto.consentText,
        status: InspectionStatus.COMPLETED,
        conductedDate: new Date(),
      },
    });
  }

  // ── Items ────────────────────────────────────────────────────────────────

  async addItem(inspectionId: string, orgId: string, dto: CreateItemDto) {
    await this.findOne(inspectionId, orgId);
    return this.prisma.inspectionItem.create({
      data: {
        inspectionId,
        name: dto.name,
        category: dto.category,
        brand: dto.brand,
        model: dto.model,
        serialNumber: dto.serialNumber,
        quantity: dto.quantity ?? 1,
        estimatedValue: dto.estimatedValue,
        condition: dto.condition,
        notes: dto.notes,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { photos: true },
    });
  }

  async updateItem(itemId: string, orgId: string, dto: UpdateItemDto) {
    const item = await this.prisma.inspectionItem.findFirst({
      where: { id: itemId, inspection: { orgId } },
    });
    if (!item) throw new NotFoundException('Équipement non trouvé');
    return this.prisma.inspectionItem.update({
      where: { id: itemId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.brand !== undefined && { brand: dto.brand }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.estimatedValue !== undefined && { estimatedValue: dto.estimatedValue }),
        ...(dto.condition !== undefined && { condition: dto.condition }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
      include: { photos: true },
    });
  }

  async removeItem(itemId: string, orgId: string) {
    const item = await this.prisma.inspectionItem.findFirst({
      where: { id: itemId, inspection: { orgId } },
    });
    if (!item) throw new NotFoundException('Équipement non trouvé');
    return this.prisma.inspectionItem.delete({ where: { id: itemId } });
  }

  async addPhoto(itemId: string, orgId: string, url: string, storagePath?: string, caption?: string) {
    const item = await this.prisma.inspectionItem.findFirst({
      where: { id: itemId, inspection: { orgId } },
    });
    if (!item) throw new NotFoundException('Équipement non trouvé');
    return this.prisma.inspectionPhoto.create({
      data: { itemId, url, storagePath, caption },
    });
  }

  async removePhoto(photoId: string, orgId: string) {
    const photo = await this.prisma.inspectionPhoto.findFirst({
      where: { id: photoId, item: { inspection: { orgId } } },
    });
    if (!photo) throw new NotFoundException('Photo non trouvée');
    return this.prisma.inspectionPhoto.delete({ where: { id: photoId } });
  }

  // ── Damages ──────────────────────────────────────────────────────────────

  async addDamage(inspectionId: string, orgId: string, dto: CreateDamageDto) {
    await this.findOne(inspectionId, orgId);
    return this.prisma.damage.create({
      data: {
        inspectionId,
        description: dto.description,
        severity: dto.severity,
        repairCost: dto.repairCost,
        replacementCost: dto.replacementCost,
        tenantResponsibility: dto.tenantResponsibility ?? true,
        depositDeduction: dto.depositDeduction,
        photoUrls: dto.photoUrls ?? [],
      },
    });
  }

  async removeDamage(damageId: string, orgId: string) {
    const damage = await this.prisma.damage.findFirst({
      where: { id: damageId, inspection: { orgId } },
    });
    if (!damage) throw new NotFoundException('Dommage non trouvé');
    return this.prisma.damage.delete({ where: { id: damageId } });
  }

  // ── Comparison (Entry vs Exit) ───────────────────────────────────────────

  async compareInspections(exitInspectionId: string, orgId: string) {
    const exit = await this.findOne(exitInspectionId, orgId);
    if (!exit.entryInspectionId) throw new NotFoundException("Pas d'état des lieux d'entrée associé");
    const entry = await this.findOne(exit.entryInspectionId, orgId);

    const itemsMap = new Map(entry.items.map((i) => [i.name.toLowerCase(), i]));
    const comparison = exit.items.map((exitItem) => {
      const entryItem = itemsMap.get(exitItem.name.toLowerCase());
      return {
        name: exitItem.name,
        category: exitItem.category,
        entry: entryItem ? { condition: entryItem.condition, notes: entryItem.notes, photos: entryItem.photos } : null,
        exit: { condition: exitItem.condition, notes: exitItem.notes, photos: exitItem.photos },
        conditionChanged: entryItem ? entryItem.condition !== exitItem.condition : false,
        missingOnEntry: !entryItem,
      };
    });

    const totalDamages = exit.damages.reduce((sum, d) => sum + Number(d.depositDeduction || 0), 0);

    return { entry, exit, comparison, totalDeduction: totalDamages, damages: exit.damages };
  }

  // ── Statistics ───────────────────────────────────────────────────────────

  async getStats(orgId: string) {
    const [total, byStatus, recentDamages] = await Promise.all([
      this.prisma.inspection.count({ where: { orgId } }),
      this.prisma.inspection.groupBy({ by: ['status'], where: { orgId }, _count: { id: true } }),
      this.prisma.damage.findMany({
        where: { inspection: { orgId }, tenantResponsibility: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { inspection: { include: { unit: { include: { building: true } }, tenant: true } } },
      }),
    ]);
    return { total, byStatus, recentDamages };
  }
}
