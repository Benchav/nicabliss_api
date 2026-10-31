export interface RoomModel {
  id: number;
  code: string;
  name: string;
  category?: string;
  description?: string;
  pricePerNight: number;
  active: boolean;
  available?: boolean;
  availableFrom?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoomWithAvailabilityModel extends RoomModel {
  available: boolean;
}
