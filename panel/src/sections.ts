// The twelve sections of the platform plan (docs/PLAN-PLATAFORMA.md). The ones not built yet say what they will do and
// where to find that today.
import type { IconName } from './components/Icon';

export interface Section {
  path: string;
  label: string;
  icon: IconName;
  ready: boolean;
  /** What the section will do, for the "Próximamente" page. */
  about: string;
  /** Where to do it in the meantime. */
  meanwhile?: { text: string; href?: string };
}

export const SECTIONS: Section[] = [
  { path: 'inicio', label: 'Inicio', icon: 'home', ready: true, about: 'La flota de un vistazo.' },
  { path: 'flota', label: 'Flota', icon: 'truck', ready: false, about: 'La ficha de cada camión con foto, sus acoplados y su historial, los kilómetros y los vencimientos.' },
  { path: 'viajes', label: 'Viajes', icon: 'route', ready: true, about: 'Todos los viajes con filtros por estado, camión, chofer y fechas, el recorrido real y la exportación a Excel, PDF y Word.' },
  { path: 'choferes', label: 'Choferes', icon: 'person', ready: false, about: 'La ficha de cada chofer con sus viajes, sus documentos y los vencimientos.' },
  { path: 'combustible', label: 'Combustible', icon: 'fuel', ready: true, about: 'Las boletas agrupadas por estación, con la cuenta corriente de cada una: cargas, pagos y saldo.' },
  { path: 'gps', label: 'GPS en vivo', icon: 'pin', ready: true, about: 'Dónde está cada camión ahora.' },
  { path: 'mantenimiento', label: 'Mantenimiento', icon: 'wrench', ready: true, about: 'Los services preventivos y correctivos, con avisos por kilómetros y por fecha.' },
  { path: 'documentacion', label: 'Documentación', icon: 'doc', ready: true, about: 'Los papeles de camiones y choferes con el archivo y su vencimiento.' },
  { path: 'finanzas', label: 'Gastos y finanzas', icon: 'money', ready: false, about: 'Gastos, facturas y cobros, la ganancia de cada viaje y un simulador de fletes.' },
  { path: 'metricas', label: 'Métricas', icon: 'chart', ready: true, about: 'El rendimiento de cada camión y de cada chofer: kilómetros, consumo y facturación, con gráficos.' },
  { path: 'asistente', label: 'Asistente IA', icon: 'sparkle', ready: false, about: 'Consultas por WhatsApp sobre la flota, respondidas con los datos del sistema.' },
  { path: 'configuracion', label: 'Configuración', icon: 'sliders', ready: false, about: 'La empresa, los usuarios y sus permisos, los catálogos y el plan.' },
];
