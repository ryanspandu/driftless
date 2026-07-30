import { DateTime } from 'luxon'
import Announcement from '#modules/announcements/models/announcement'
import { newUlid } from '#services/ulid_service'

export interface AnnouncementDto {
  id: string
  title: string
  body: string
  published: boolean
  createdAt: string
  updatedAt: string
}

export default class AnnouncementsService {
  async findAll(): Promise<AnnouncementDto[]> {
    const rows = await Announcement.query().whereNull('deleted_at').orderBy('created_at', 'desc')
    return rows.map((r) => this.toDto(r))
  }

  async findPublished(): Promise<AnnouncementDto[]> {
    const rows = await Announcement.query()
      .where('published', true)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
    return rows.map((r) => this.toDto(r))
  }

  async create(
    userId: number | null,
    dto: { title: string; body: string; published?: boolean }
  ): Promise<AnnouncementDto> {
    const row = await Announcement.create({
      id: newUlid(),
      title: dto.title,
      body: dto.body,
      published: dto.published ?? false,
      createdByUserId: userId,
    })
    return this.toDto(row)
  }

  async update(
    id: string,
    dto: { title?: string; body?: string; published?: boolean }
  ): Promise<AnnouncementDto> {
    const row = await Announcement.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (dto.title !== undefined) row.title = dto.title
    if (dto.body !== undefined) row.body = dto.body
    if (dto.published !== undefined) row.published = dto.published
    await row.save()
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await Announcement.query().where('id', id).whereNull('deleted_at').firstOrFail()
    row.deletedAt = DateTime.now()
    await row.save()
  }

  private toDto(row: Announcement): AnnouncementDto {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      published: Boolean(row.published),
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }
}
