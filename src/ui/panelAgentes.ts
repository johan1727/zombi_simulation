import type { Citizen, RolAgente } from '../sim/types';
import type { World } from '../sim/world';
import { POLICIA } from '../sim/config';
import type { Controles } from '../game/controles';

const NOMBRES_ROL: Record<Exclude<RolAgente, ''>, string> = {
  policia: 'Policía',
  paramedico: 'Paramédico',
  megafono: 'Megáfono',
  obrero: 'Obrero',
};

/** Nombre de la habilidad con su dilema, tal como lo ve el jugador. */
const HABILIDAD_NOMBRE: Record<Exclude<RolAgente, ''>, string> = {
  policia: 'Disparar (ruido)',
  paramedico: 'Diagnosticar/Revivir',
  megafono: 'Megáfono (manipula)',
  obrero: 'Reforzar puerta',
};

/** Todas las habilidades comparten el mismo enfriamiento estándar (ver src/sim/agentes.ts). */
const COOLDOWN_MAX = POLICIA.cooldownTicks;

interface TarjetaDom {
  agente: Citizen;
  card: HTMLDivElement;
  estado: HTMLDivElement;
  boton: HTMLButtonElement;
  fill: HTMLDivElement;
}

/**
 * Barra inferior con una tarjeta por agente: rol, tecla, estado, botón de
 * habilidad (con el dilema en el nombre) y barra de cooldown. Click en
 * tarjeta selecciona; click en botón arma el modo habilidad. Toda la
 * interacción pasa por `Controles` — el panel nunca toca la sim.
 */
export class PanelAgentes {
  private readonly agentes: Citizen[];
  private readonly tarjetas: TarjetaDom[] = [];

  constructor(world: World, controles: Controles) {
    this.agentes = world.agentes;
    const el = document.getElementById('panel-agentes') as HTMLDivElement;

    this.agentes.forEach((agente, i) => {
      const rol = agente.rolAgente as Exclude<RolAgente, ''>;
      const card = document.createElement('div');
      card.className = 'agente-card';

      const nombre = document.createElement('div');
      nombre.className = 'agente-card-nombre';
      nombre.innerHTML = `${NOMBRES_ROL[rol]} <span class="tecla">${i + 1}</span>`;

      const estado = document.createElement('div');
      estado.className = 'agente-card-estado';

      const boton = document.createElement('button');
      boton.className = 'agente-card-habilidad';
      boton.type = 'button';

      const cooldownBar = document.createElement('div');
      cooldownBar.className = 'cooldown-bar';
      const fill = document.createElement('div');
      fill.className = 'cooldown-fill';
      cooldownBar.appendChild(fill);

      card.appendChild(nombre);
      card.appendChild(estado);
      card.appendChild(boton);
      card.appendChild(cooldownBar);
      el.appendChild(card);

      card.addEventListener('click', () => controles.seleccionar(agente.id));
      boton.addEventListener('click', (e) => {
        e.stopPropagation();
        controles.seleccionar(agente.id);
        controles.activarModoHabilidad();
      });

      this.tarjetas.push({ agente, card, estado, boton, fill });
    });
  }

  update(world: World, seleccionado: number): void {
    for (const t of this.tarjetas) {
      const a = t.agente;
      t.card.classList.toggle('seleccionado', a.id === seleccionado);

      if (a.salud === 'sano') {
        t.estado.textContent = '● Sano';
      } else if (a.salud === 'caido') {
        const segs = Math.max(0, Math.ceil(a.caidoTicks / 30));
        t.estado.textContent = `● Caído (${segs}s)`;
      } else {
        t.estado.textContent = '● Perdido';
      }

      const rol = a.rolAgente as Exclude<RolAgente, ''>;
      let etiqueta = HABILIDAD_NOMBRE[rol];
      if (rol === 'obrero') etiqueta += ` (x${world.usosObrero})`;
      t.boton.textContent = etiqueta;
      t.boton.disabled =
        a.salud !== 'sano' || a.cdHabilidad > 0 || (rol === 'obrero' && world.usosObrero <= 0);

      const pct = Math.max(0, Math.min(1, a.cdHabilidad / COOLDOWN_MAX));
      t.fill.style.width = `${Math.round(pct * 100)}%`;
    }
  }
}
