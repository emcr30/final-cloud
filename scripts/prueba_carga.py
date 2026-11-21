"""Prueba de carga simple de CanchaYa (sin instalar k6 ni locust).

Lanza N peticiones con C usuarios concurrentes y mide latencias (p50, p95,
p99, máx), peticiones por segundo y errores.

Escenarios:
  1. health        → GET  <API>/health                  (backend FastAPI, sin rate limit)
  2. disponibilidad → POST <Supabase>/rest/v1/rpc/disponibilidad  (Postgres vía PostgREST)
  3. rate-limit    → GET  <API>/me sin token: demuestra el 429 del rate limit (100/min por IP)

Uso (desde la raíz del repo, con el backend corriendo):
    backend/.venv/bin/python scripts/prueba_carga.py
    backend/.venv/bin/python scripts/prueba_carga.py --api http://localhost:8000 --n 2000 --c 50

Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de frontend/.env (la llave
pública: el escenario 2 es lo mismo que hace un visitante anónimo).
"""
import argparse
import asyncio
import statistics
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parent.parent


def leer_env(ruta: Path) -> dict[str, str]:
    valores = {}
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                valores[k.strip()] = v.strip()
    return valores


async def escenario(nombre: str, n: int, c: int, hacer) -> dict:
    """Ejecuta `hacer(cliente)` n veces con c tareas concurrentes."""
    latencias: list[float] = []
    codigos: dict[int | str, int] = {}
    pendientes = iter(range(n))

    async def trabajador(cliente: httpx.AsyncClient):
        for _ in pendientes:  # el iterador compartido reparte el trabajo
            t0 = time.perf_counter()
            try:
                r = await hacer(cliente)
                codigo: int | str = r.status_code
            except httpx.HTTPError as e:
                codigo = type(e).__name__
            latencias.append((time.perf_counter() - t0) * 1000)
            codigos[codigo] = codigos.get(codigo, 0) + 1

    inicio = time.perf_counter()
    limites = httpx.Limits(max_connections=c, max_keepalive_connections=c)
    async with httpx.AsyncClient(timeout=30, limits=limites) as cliente:
        await asyncio.gather(*(trabajador(cliente) for _ in range(c)))
    total = time.perf_counter() - inicio

    lat = sorted(latencias)
    pct = lambda p: lat[min(len(lat) - 1, int(len(lat) * p))]  # noqa: E731
    res = {
        "escenario": nombre, "peticiones": n, "concurrencia": c, "duracion_s": round(total, 2),
        "rps": round(n / total, 1), "p50_ms": round(statistics.median(lat), 1), "p95_ms": round(pct(0.95), 1),
        "p99_ms": round(pct(0.99), 1), "max_ms": round(lat[-1], 1), "codigos": codigos,
    }
    print(f"\n== {nombre} ==  {n} peticiones, {c} concurrentes")
    print(f"   duración {res['duracion_s']} s · {res['rps']} req/s")
    print(f"   latencia p50 {res['p50_ms']} ms · p95 {res['p95_ms']} ms · p99 {res['p99_ms']} ms · máx {res['max_ms']} ms")
    print(f"   códigos HTTP: {codigos}")
    return res


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:8000", help="URL del backend")
    ap.add_argument("--n", type=int, default=2000, help="peticiones al /health")
    ap.add_argument("--c", type=int, default=50, help="concurrencia del /health")
    ap.add_argument("--n-rpc", type=int, default=300, help="peticiones a la RPC (Supabase plan gratis: no exagerar)")
    ap.add_argument("--c-rpc", type=int, default=10, help="concurrencia de la RPC")
    args = ap.parse_args()

    env = leer_env(RAIZ / "frontend" / ".env")
    sb_url, anon = env.get("VITE_SUPABASE_URL"), env.get("VITE_SUPABASE_ANON_KEY")
    if not sb_url or not anon:
        sys.exit("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en frontend/.env")

    # Una cancha activa cualquiera y la fecha de mañana para la RPC
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{sb_url}/rest/v1/canchas?select=id&activa=eq.true&limit=1", headers={"apikey": anon})
        cancha_id = r.json()[0]["id"]
    manana = (date.today() + timedelta(days=1)).isoformat()
    cab = {"apikey": anon, "Authorization": f"Bearer {anon}", "Content-Type": "application/json"}

    resultados = [
        await escenario("GET /health (backend local)", args.n, args.c,
                        lambda cl: cl.get(f"{args.api}/health")),
        await escenario("RPC disponibilidad (Supabase)", args.n_rpc, args.c_rpc,
                        lambda cl: cl.post(f"{sb_url}/rest/v1/rpc/disponibilidad", headers=cab,
                                           json={"p_cancha_id": cancha_id, "p_fecha": manana})),
        await escenario("GET /me sin token x150 (rate limit)", 150, 5,
                        lambda cl: cl.get(f"{args.api}/me")),
    ]

    print("\n| Escenario | Peticiones | Concurrencia | req/s | p50 ms | p95 ms | p99 ms | máx ms | Códigos |")
    print("|---|---|---|---|---|---|---|---|---|")
    for r in resultados:
        print(f"| {r['escenario']} | {r['peticiones']} | {r['concurrencia']} | {r['rps']} | {r['p50_ms']} | "
              f"{r['p95_ms']} | {r['p99_ms']} | {r['max_ms']} | {r['codigos']} |")


if __name__ == "__main__":
    asyncio.run(main())
