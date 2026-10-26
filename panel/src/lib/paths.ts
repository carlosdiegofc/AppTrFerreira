// The addresses of the cards, shared by their pages and the search of the top bar.
export const truckPath = (key: string) => `/flota/camion/${encodeURIComponent(key)}`;
export const trailerPath = (id: string) => `/flota/acoplado/${id}`;
export const driverPath = (id: string) => `/choferes/${id}`;
