import type { EstadoPedido } from "../models/food-order.model.js";
import type { ConsumptionStatus } from "../models/service.model.js";

/**
 * Transiciones permitidas del pedido. "Entregado" y "Cancelado" son terminales:
 * una vez que el cargo entra a la cuenta no puede reabrirse ni cambiarse por
 * una vía alterna.
 */
export const foodOrderTransitions: Record<EstadoPedido, readonly EstadoPedido[]> = {
  Pendiente: ["En preparación", "En camino", "Entregado", "Cancelado"],
  "En preparación": ["En camino", "Entregado", "Cancelado"],
  "En camino": ["Entregado", "Cancelado"],
  Entregado: [],
  Cancelado: [],
};

/**
 * Traduce el estado operativo del pedido al estado contable del consumo.
 * "En camino" sigue siendo un servicio pendiente: no debe facturarse hasta
 * que el pedido esté realmente entregado.
 */
export function toConsumptionStatus(estado: EstadoPedido): ConsumptionStatus {
  switch (estado) {
    case "Pendiente":
      return "Registrado";
    case "En preparación":
    case "En camino":
      return "EnProceso";
    case "Entregado":
      return "Entregado";
    case "Cancelado":
      return "Cancelado";
  }
}
