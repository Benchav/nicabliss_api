export interface CreateCustomerDto {
  nombre: string;
  apellido?: string;
  documento: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
}

export type UpdateCustomerDto = Partial<CreateCustomerDto>;
