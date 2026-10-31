export interface CreateRoomDto {
  code: string;
  name: string;
  category?: string;
  description?: string;
  pricePerNight?: number | string;
  active?: boolean;
}

export type UpdateRoomDto = Partial<CreateRoomDto>;
