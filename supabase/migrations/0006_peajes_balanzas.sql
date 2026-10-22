-- Peajes y balanzas del MTOP en el mapa del GPS, aprobado el 22/10/2026. Solo agrega puntos de control: no cambia ni
-- borra los que ya existen ni toca pasos anteriores, porque cada punto cuenta desde su alta. Los peajes entran sin tarifa.
-- Sources, read on 22/10/2026: the MTOP Geoportal (WFS layers inf_tte_ttelog_terrestre:peajes and :puestos_pesaje) and,
-- for each toll plaza, its booth line in OpenStreetMap; every place was checked on a satellite picture.
-- A point is skipped when one of the same kind, archived or not, is already within 300 m: the tolls loaded by hand and
-- any point the owner archived stay as they are.
insert into public.trf_road_points (name, kind, latitude, longitude, notes)
select v.name, v.kind, v.latitude, v.longitude, v.notes ||
  case v.kind
    when 'toll' then ' Ubicación: OpenStreetMap y MTOP, revisada en foto satelital. Tarifa pendiente.'
    else ' Ubicación: Geoportal del MTOP, revisada en foto satelital.'
  end
from (values
  ('Peaje Pando', 'toll', -34.784821, -55.888530, 'Ruta Interbalnearia km 32,4, Canelones. Concesión: CIEMSA.'),
  ('Peaje Solís', 'toll', -34.777512, -55.392450, 'Ruta Interbalnearia km 81, Maldonado. Concesión: CIEMSA.'),
  ('Peaje Soca', 'toll', -34.672288, -55.765381, 'Ruta 8 km 50,5, Canelones. Concesión: Camino a las Sierras S.A.'),
  ('Peaje Cebollatí', 'toll', -33.837556, -54.766413, 'Ruta 8 km 206,25, Lavalleja. Concesión: CIEMSA.'),
  ('Peaje Capilla de Cella', 'toll', -34.706404, -55.466127, 'Ruta 9 km 79,5, Canelones. Concesión: CIEMSA.'),
  ('Peaje Garzón', 'toll', -34.602749, -54.426539, 'Ruta 9 km 191, Rocha. Concesión: CIEMSA.'),
  ('Peaje Santa Lucía', 'toll', -34.443248, -56.422136, 'Ruta 11 km 81, San José. Concesión: CIEMSA.'),
  ('Peaje Barra de Santa Lucía', 'toll', -34.776390, -56.366203, 'Ruta 1 km 23,5, San José. Concesión: Consorcio Cruz del Sur.'),
  ('Peaje Cufré', 'toll', -34.354985, -57.113492, 'Ruta 1 km 107,35, Colonia. Concesión: Consorcio Cruz del Sur.'),
  ('Peaje Mercedes', 'toll', -33.211988, -58.047956, 'Ruta 2 km 284,4, Río Negro. Concesión: Consorcio Cruz del Sur.'),
  ('Peaje Paso del Puerto', 'toll', -33.128973, -57.172657, 'Ruta 3 km 245,2, Soriano. Concesión: Consorcio Cruz del Sur.'),
  ('Peaje Queguay', 'toll', -32.14554, -57.93869, 'Ruta 3 km 392,75, Paysandú. Concesión: Consorcio Cruz del Sur.'),
  ('Peaje Mendoza', 'toll', -34.33482, -56.24509, 'Ruta 5 km 67,7, Florida. Concesión: Hernández y González S.A.'),
  ('Peaje Centenario', 'toll', -32.839941, -56.493546, 'Ruta 5 km 246,35, Durazno. Concesión: Consorcio Cruz del Sur.'),
  ('Peaje Manuel Díaz', 'toll', -31.546738, -55.698775, 'Ruta 5 km 423,2, Tacuarembó. Concesión: Consorcio Cruz del Sur.'),
  ('Peaje Puente General San Martín', 'toll', -33.109647, -58.246447, 'Puente internacional Fray Bentos–Puerto Unzué, Río Negro. Lo cobra la CARU.'),
  ('Peaje Puente General Artigas', 'toll', -32.265881, -58.093404, 'Puente internacional Paysandú–Colón, Paysandú. Lo cobra la CARU.'),
  ('Balanza Tacuarembó', 'scale', -31.633610, -55.891170, 'Ruta 5 km 402. 2 balanzas, una en cada sentido.'),
  ('Balanza Mendoza', 'scale', -34.336566, -56.245375, 'Ruta 5 km 67,5. 2 balanzas, una en cada sentido.'),
  ('Balanza Nueva Palmira', 'scale', -33.884172, -58.366403, 'Ruta 12 km 3. 1 balanza, hacia Nueva Palmira.'),
  ('Balanza Chamizo', 'scale', -34.244717, -55.925561, 'Ruta 6 km 86,3. 1 balanza, hacia Montevideo.'),
  ('Balanza Soca', 'scale', -34.662608, -55.615938, 'Ruta 8 km 64. 2 balanzas, una en cada sentido.'),
  ('Balanza Nuevo Berlín', 'scale', -33.058697, -58.035244, 'Ruta 24 km 19. 1 balanza, hacia Fray Bentos.'),
  ('Balanza Conchillas', 'scale', -34.132894, -57.981781, 'Ruta 55 km 0,6. 1 balanza, hacia Punta Pereira.'),
  ('Balanza Ruta 1', 'scale', -34.775154, -56.377419, 'Ruta 1 km 24,6. 2 balanzas, una en cada sentido.'),
  ('Balanza Arrayanes', 'scale', -33.209791, -58.051925, 'Ruta 2 km 284,9. 1 balanza, hacia Fray Bentos.'),
  ('Balanza San Manuel', 'scale', -32.441253, -57.994169, 'Ruta 3 km 355. 2 balanzas, una en cada sentido.'),
  ('Balanza Ruta 11', 'scale', -34.443040, -56.423515, 'Ruta 11 km 80,8. 2 balanzas, una en cada sentido.'),
  ('Balanza Dolores', 'scale', -33.515795, -58.195572, 'Ruta 21 km 323,2. 1 balanza, hacia Dolores.'),
  ('Balanza Fray Bentos', 'scale', -33.110805, -58.246572, 'Ruta 2 km 307,5, paso de frontera. 1 balanza, hacia Montevideo.'),
  ('Balanza Ruta 15', 'scale', -33.627664, -54.157512, 'Ruta 15 km 138. Abre solo en una época del año. 1 balanza, hacia Lascano.'),
  ('Balanza Bolívar', 'scale', -34.223176, -55.736934, 'Ruta 7 km 92,5. 1 balanza, hacia Montevideo.'),
  ('Balanza Nueva Palmira (bypass)', 'scale', -33.874107, -58.387708, 'Bypass de Nueva Palmira. 1 balanza, hacia el puerto.'),
  ('Balanza Centenario (UPM)', 'scale', -32.859565, -56.492571, 'Centenario, Durazno. 1 balanza, hacia la planta de UPM.'),
  ('Balanza Treinta y Tres', 'scale', -33.285809, -54.443875, 'Ruta 8 km 277,5. 1 balanza, hacia Montevideo.'),
  ('Balanza Villa Serrana', 'scale', -34.324954, -55.059410, 'Ruta 8 km 137. 1 balanza, hacia Montevideo.'),
  ('Balanza Pan de Azúcar', 'scale', -34.749579, -55.101058, 'Ruta 9 km 119,5. 2 balanzas, una en cada sentido.'),
  ('Balanza Chuy', 'scale', -33.704922, -53.459188, 'Ruta 9 km 336. 1 balanza, hacia Montevideo.'),
  ('Balanza Río Branco', 'scale', -32.586490, -53.463776, 'Ruta 26 km 79,2. 2 balanzas, una en cada sentido.'),
  ('Balanza Durazno', 'scale', -33.390634, -56.599338, 'Ruta 14 km 169,75. 1 balanza, hacia Durazno.'),
  ('Balanza Santa Bernardina', 'scale', -33.340108, -56.479804, 'Ruta 14 km 185,6. 1 balanza, hacia Durazno.')
) as v(name, kind, latitude, longitude, notes)
where not exists (
  select 1 from public.trf_road_points p
  where p.kind = v.kind and trf_private.road_distance(p.latitude, p.longitude, v.latitude, v.longitude) < 300
);
