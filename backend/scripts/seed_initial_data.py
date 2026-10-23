
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Entidad, Sucursal, Servicio, ServicioSucursal


def cargar_datos_iniciales():
    db = SessionLocal()

    try:
        # 1. Crear o recuperar la entidad bancaria de prueba
        entidad = db.scalar(
            select(Entidad).where(
                Entidad.nombre == "Banco de Prueba"
            )
        )

        if entidad is None:
            entidad = Entidad(
                nombre="Banco de Prueba",
                nombre_comercial="Banco de Prueba",
                identificador_legal=None,
                estado=True,
            )
            db.add(entidad)
            db.flush()
            print("Entidad bancaria creada.")
        else:
            print("La entidad bancaria ya existe.")

        # 2. Crear o recuperar la sucursal de prueba
        sucursal = db.scalar(
            select(Sucursal).where(
                Sucursal.entidad_id == entidad.id,
                Sucursal.codigo == "SUC001",
            )
        )

        if sucursal is None:
            sucursal = Sucursal(
                entidad_id=entidad.id,
                codigo="SUC001",
                nombre="Sucursal Principal de Prueba",
                departamento="Antioquia",
                ciudad="Medellín",
                direccion="Dirección de prueba",
                zona_horaria="America/Bogota",
                estado=True,
            )
            db.add(sucursal)
            db.flush()
            print("Sucursal creada.")
        else:
            print("La sucursal ya existe.")

        # 3. Catálogo de servicios.
        # Se conservan los códigos y prefijos originales.
        servicios_iniciales = [
            {
                "codigo": "CAJA",
                "nombre": "Caja",
                "categoria": "presencial",
                "prefijo": "C",
            },
            {
                "codigo": "ASESORIA",
                "nombre": "Asesoría",
                "categoria": "presencial",
                "prefijo": "A",
            },
            {
                "codigo": "INFORMACION",
                "nombre": "Información",
                "categoria": "presencial",
                "prefijo": "I",
            },
            {
                "codigo": "CAJA_PRIORITARIA",
                "nombre": "Caja prioritaria",
                "categoria": "presencial",
                "prefijo": "CP",
            },
            {
                "codigo": "CAJA_TURNOS",
                "nombre": "Caja turnos",
                "categoria": "presencial",
                "prefijo": "CT",
            },
            {
                "codigo": "ASESORIA_PRIORITARIA",
                "nombre": "Asesoría prioritaria",
                "categoria": "presencial",
                "prefijo": "AP",
            },
            {
                "codigo": "ASESORIA_TURNOS",
                "nombre": "Asesoría turnos",
                "categoria": "presencial",
                "prefijo": "AT",
            },
        ]

        # 4. Crear los servicios que falten y habilitarlos
        for datos in servicios_iniciales:
            servicio = db.scalar(
                select(Servicio).where(
                    Servicio.codigo_interno == datos["codigo"]
                )
            )

            if servicio is None:
                servicio = Servicio(
                    codigo_interno=datos["codigo"],
                    nombre=datos["nombre"],
                    categoria=datos["categoria"],
                    estado=True,
                )
                db.add(servicio)
                db.flush()
                print(f"Servicio creado: {datos['nombre']}")
            else:
                print(f"El servicio ya existe: {datos['nombre']}")

            relacion = db.scalar(
                select(ServicioSucursal).where(
                    ServicioSucursal.sucursal_id == sucursal.id,
                    ServicioSucursal.servicio_id == servicio.id,
                )
            )

            if relacion is None:
                relacion = ServicioSucursal(
                    sucursal_id=sucursal.id,
                    servicio_id=servicio.id,
                    habilitado=True,
                    prefijo_turno=datos["prefijo"],
                    atiende_dolares=False,
                    configuracion_json=None,
                )
                db.add(relacion)
                print(
                    "Servicio habilitado en la sucursal: "
                    f"{datos['nombre']}"
                )
            else:
                # No modificar prefijos ni configuraciones existentes.
                # Así se preservan los códigos de los servicios actuales.
                print(
                    "El servicio ya está configurado en la sucursal: "
                    f"{datos['nombre']}"
                )

        db.commit()
        print("\nDatos iniciales cargados correctamente.")

    except Exception:
        db.rollback()
        print("Ocurrió un error. Se revirtieron los cambios.")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    cargar_datos_iniciales()
