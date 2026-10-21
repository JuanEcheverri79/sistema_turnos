
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import (
    DocumentacionTurno,
    HistorialTurno,
    Servicio,
    ServicioSucursal,
    Sucursal,
    Turno,
)


PRIORIDAD_NORMAL = "Normal"
PRIORIDAD_PREFERENCIAL = "Preferencial"
PRIORIDAD_VIRTUAL = "Turno_Virtual"


def bloquear_modulo(
    db: Session,
    sucursal_id: int,
    modulo: str,
) -> None:
    """Serializa las operaciones por módulo."""
    clave_bloqueo = f"modulo:{sucursal_id}:{modulo}"

    db.execute(
        text(
            "SELECT pg_advisory_xact_lock("
            "hashtextextended(:clave, 0))"
        ),
        {"clave": clave_bloqueo},
    )


def generar_turno(
    db: Session,
    sucursal_id: int,
    servicio_id: int,
    prioridad: str = PRIORIDAD_NORMAL,
    origen: str = "kiosco",
) -> Turno:
    sucursal = db.scalar(
        select(Sucursal).where(
            Sucursal.id == sucursal_id,
            Sucursal.estado.is_(True),
        )
    )

    if sucursal is None:
        raise ValueError("La sucursal no existe o está inactiva.")

    servicio = db.scalar(
        select(Servicio)
        .join(
            ServicioSucursal,
            ServicioSucursal.servicio_id == Servicio.id,
        )
        .where(
            ServicioSucursal.sucursal_id == sucursal_id,
            ServicioSucursal.servicio_id == servicio_id,
            ServicioSucursal.habilitado.is_(True),
            Servicio.estado.is_(True),
        )
    )

    if servicio is None:
        raise ValueError(
            "El servicio no está habilitado en esta sucursal."
        )

    if prioridad not in (
        PRIORIDAD_NORMAL,
        PRIORIDAD_PREFERENCIAL,
        PRIORIDAD_VIRTUAL,
    ):
        raise ValueError(
            "La prioridad debe ser Normal, Preferencial "
            "o Turno_Virtual."
        )

    ahora = datetime.now(ZoneInfo(sucursal.zona_horaria))
    fecha_operativa = ahora.date()

    try:
        # Cada prioridad tiene su propio contador diario.
        clave_bloqueo = (
            f"turno:{sucursal_id}:{servicio_id}:"
            f"{fecha_operativa}:{prioridad}"
        )

        db.execute(
            text(
                "SELECT pg_advisory_xact_lock("
                "hashtextextended(:clave, 0))"
            ),
            {"clave": clave_bloqueo},
        )

        ultimo_numero = db.scalar(
            select(func.max(Turno.numero_diario)).where(
                Turno.sucursal_id == sucursal_id,
                Turno.servicio_id == servicio_id,
                Turno.fecha_operativa == fecha_operativa,
                Turno.prioridad == prioridad,
            )
        )

        numero_diario = (ultimo_numero or 0) + 1

        configuracion = db.scalar(
            select(ServicioSucursal).where(
                ServicioSucursal.sucursal_id == sucursal_id,
                ServicioSucursal.servicio_id == servicio_id,
            )
        )

        if configuracion is None:
            raise ValueError(
                "No se encontró la configuración del servicio."
            )

        # Diferenciar el código según la prioridad del turno.
        prefijo_base = configuracion.prefijo_turno

        if prioridad == PRIORIDAD_NORMAL:
            prefijo = prefijo_base
        elif prioridad == PRIORIDAD_PREFERENCIAL:
            prefijo = f"{prefijo_base}P"
        elif prioridad == PRIORIDAD_VIRTUAL:
            prefijo = f"{prefijo_base}V"
        else:
            raise ValueError("Prioridad de turno no válida.")

        codigo = f"{prefijo}{numero_diario:03d}"

        turno = Turno(
            sucursal_id=sucursal_id,
            servicio_id=servicio_id,
            codigo=codigo,
            fecha_operativa=fecha_operativa,
            numero_diario=numero_diario,
            prioridad=prioridad,
            estado="en_espera",
            origen=origen,
        )

        db.add(turno)
        db.flush()

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=None,
                estado_nuevo="en_espera",
                motivo="Creación del turno",
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise


def listar_turnos(
    db: Session,
    sucursal_id: int | None = None,
    estado: str | None = None,
    servicio_id: int | None = None,
) -> list[Turno]:
    consulta = select(Turno)

    if sucursal_id is not None:
        consulta = consulta.where(
            Turno.sucursal_id == sucursal_id
        )

    if estado is not None:
        consulta = consulta.where(
            Turno.estado == estado
        )

    if servicio_id is not None:
        consulta = consulta.where(
            Turno.servicio_id == servicio_id
        )

    consulta = consulta.order_by(Turno.creado_en.desc())

    return list(db.scalars(consulta).all())


def obtener_turno_por_id(
    db: Session,
    turno_id: int,
) -> Turno | None:
    return db.get(Turno, turno_id)


def llamar_siguiente_turno(
    db: Session,
    sucursal_id: int,
    servicio_id: int,
    modulo: str,
) -> Turno | None:
    try:
        bloquear_modulo(db, sucursal_id, modulo)

        # No permitir dos turnos llamados simultáneamente
        # en el mismo módulo.
        turno_activo = db.scalar(
            select(Turno.id)
            .where(
                Turno.sucursal_id == sucursal_id,
                Turno.modulo == modulo,
                Turno.estado == "llamado",
            )
            .limit(1)
        )

        if turno_activo is not None:
            raise ValueError(
                "Este módulo ya tiene un turno llamado. "
                "Retén, finaliza o marca como ausente el turno "
                "actual antes de llamar a otro."
            )

        # Verificar que el servicio esté habilitado.
        servicio_habilitado = db.scalar(
            select(ServicioSucursal).where(
                ServicioSucursal.sucursal_id == sucursal_id,
                ServicioSucursal.servicio_id == servicio_id,
                ServicioSucursal.habilitado.is_(True),
            )
        )

        if servicio_habilitado is None:
            raise ValueError(
                "El servicio no está habilitado en esta sucursal."
            )

        # Obtener el turno más antiguo de cada prioridad.
        turnos_por_prioridad = {}

        for prioridad in (
            PRIORIDAD_NORMAL,
            PRIORIDAD_PREFERENCIAL,
            PRIORIDAD_VIRTUAL,
        ):
            turnos_por_prioridad[prioridad] = db.scalar(
                select(Turno)
                .where(
                    Turno.sucursal_id == sucursal_id,
                    Turno.servicio_id == servicio_id,
                    Turno.estado == "en_espera",
                    Turno.prioridad == prioridad,
                )
                .order_by(
                    Turno.creado_en.asc(),
                    Turno.id.asc(),
                )
                .with_for_update(skip_locked=True)
                .limit(1)
            )

        normal = turnos_por_prioridad[PRIORIDAD_NORMAL]
        preferencial = turnos_por_prioridad[
            PRIORIDAD_PREFERENCIAL
        ]
        virtual = turnos_por_prioridad[PRIORIDAD_VIRTUAL]

        if normal is None and preferencial is None and virtual is None:
            db.commit()
            return None

        # Obtener el historial de llamadas del módulo.
        historial_llamadas = db.execute(
            select(
                Turno.prioridad,
                HistorialTurno.cambiado_en,
                HistorialTurno.id,
            )
            .join(
                HistorialTurno,
                HistorialTurno.turno_id == Turno.id,
            )
            .where(
                Turno.sucursal_id == sucursal_id,
                Turno.modulo == modulo,
                HistorialTurno.estado_nuevo == "llamado",
            )
            .order_by(
                HistorialTurno.cambiado_en.desc(),
                HistorialTurno.id.desc(),
            )
        ).all()

        # Contar las llamadas normales desde la última llamada
        # preferencial y las normales/preferenciales desde
        # la última llamada virtual.
        normales_desde_preferencial = 0
        otros_desde_virtual = 0

        encontro_preferencial = False
        encontro_virtual = False

        for prioridad, _, _ in historial_llamadas:
            if not encontro_preferencial:
                if prioridad == PRIORIDAD_PREFERENCIAL:
                    encontro_preferencial = True
                elif prioridad == PRIORIDAD_NORMAL:
                    normales_desde_preferencial += 1

            if not encontro_virtual:
                if prioridad == PRIORIDAD_VIRTUAL:
                    encontro_virtual = True
                elif prioridad in (
                    PRIORIDAD_NORMAL,
                    PRIORIDAD_PREFERENCIAL,
                ):
                    otros_desde_virtual += 1

            if encontro_preferencial and encontro_virtual:
                break

        # Si nunca se ha llamado una prioridad, no se limita
        # su primera atención por el historial.
        if not encontro_preferencial:
            normales_desde_preferencial = 0

        if not encontro_virtual:
            otros_desde_virtual = 0

        # Preferencial: después de dos llamadas normales.
        preferencial_debe_pasar = (
            preferencial is not None
            and (
                normales_desde_preferencial >= 2
                or normal is None
            )
        )

        # Virtual: después de tres llamadas normales o
        # preferenciales.
        virtual_debe_pasar = (
            virtual is not None
            and (
                otros_desde_virtual >= 3
                or (normal is None and preferencial is None)
            )
        )

        # Si las dos reglas se cumplen al mismo tiempo,
        # se prioriza Preferencial.
        if preferencial_debe_pasar:
            turno = preferencial

        elif virtual_debe_pasar:
            turno = virtual

        elif normal is not None:
            turno = normal

        elif preferencial is not None:
            turno = preferencial

        else:
            turno = virtual

        ahora = datetime.now().astimezone()
        estado_anterior = turno.estado

        turno.estado = "llamado"
        turno.modulo = modulo
        turno.llamado_en = ahora

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo="llamado",
                motivo=(
                    f"Turno {turno.codigo} llamado al módulo "
                    f"{modulo}. Prioridad: {turno.prioridad}."
                ),
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise


def marcar_turno_ausente(
    db: Session,
    turno_id: int,
) -> Turno:
    try:
        turno = db.scalar(
            select(Turno)
            .where(Turno.id == turno_id)
            .with_for_update()
        )

        if turno is None:
            raise ValueError("El turno no existe.")

        if turno.estado != "llamado":
            raise ValueError(
                "Solo se pueden marcar como ausentes "
                "los turnos llamados."
            )

        estado_anterior = turno.estado
        turno.estado = "ausente"
        turno.ausente_en = datetime.now().astimezone()

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo="ausente",
                motivo="El cliente no respondió al llamado.",
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise


def retener_turno(
    db: Session,
    turno_id: int,
    motivo: str,
) -> Turno:
    try:
        turno = db.scalar(
            select(Turno)
            .where(Turno.id == turno_id)
            .with_for_update()
        )

        if turno is None:
            raise ValueError("El turno no existe.")

        if turno.estado != "llamado":
            raise ValueError(
                "Solo se pueden retener turnos que hayan sido llamados."
            )

        motivo = motivo.strip()

        if not motivo:
            raise ValueError(
                "Debes indicar el motivo de la retención."
            )

        estado_anterior = turno.estado
        turno.estado = "retenido"

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo="retenido",
                motivo=motivo,
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise


def reactivar_turno(
    db: Session,
    turno_id: int,
) -> Turno:
    try:
        turno = db.scalar(
            select(Turno)
            .where(Turno.id == turno_id)
            .with_for_update()
        )

        if turno is None:
            raise ValueError("El turno no existe.")

        if turno.estado not in ("retenido", "ausente"):
            raise ValueError(
                "Solo se pueden reactivar turnos retenidos o ausentes."
            )

        if not turno.modulo:
            raise ValueError(
                "No se puede reactivar el turno porque no tiene "
                "un módulo asignado."
            )

        ahora = datetime.now().astimezone()

        if turno.estado == "ausente":
            if turno.ausente_en is None:
                raise ValueError(
                    "No se puede reactivar este turno porque "
                    "no tiene registrada la fecha de ausencia."
                )

            fecha_ausencia = turno.ausente_en

            if fecha_ausencia.tzinfo is None:
                fecha_ausencia = fecha_ausencia.replace(
                    tzinfo=ahora.tzinfo
                )

            tiempo_ausente = ahora - fecha_ausencia

            if tiempo_ausente.total_seconds() > 20 * 60:
                raise ValueError(
                    "No se puede reactivar el turno: han pasado "
                    "más de 20 minutos desde la ausencia."
                )

            estado_anterior = turno.estado
            turno.estado = "en_espera"
            turno.llamado_en = None
            turno.ausente_en = None

            motivo = (
                "Turno ausente reactivado y devuelto "
                "a la fila de espera."
            )

        else:
            bloquear_modulo(
                db,
                turno.sucursal_id,
                turno.modulo,
            )

            otro_turno_activo = db.scalar(
                select(Turno.id)
                .where(
                    Turno.sucursal_id == turno.sucursal_id,
                    Turno.modulo == turno.modulo,
                    Turno.estado == "llamado",
                    Turno.id != turno.id,
                )
                .limit(1)
            )

            if otro_turno_activo is not None:
                raise ValueError(
                    "No se puede reactivar el turno porque el módulo "
                    "ya tiene otro turno llamado. Retén o finaliza "
                    "el otro turno antes de continuar."
                )

            estado_anterior = turno.estado
            turno.estado = "llamado"
            turno.llamado_en = ahora

            motivo = "Reactivación de turno retenido."

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo=turno.estado,
                motivo=motivo,
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise


def finalizar_turno(
    db: Session,
    turno_id: int,
) -> Turno:
    try:
        turno = db.scalar(
            select(Turno)
            .where(Turno.id == turno_id)
            .with_for_update()
        )

        if turno is None:
            raise ValueError("El turno no existe.")

        if turno.estado != "llamado":
            raise ValueError(
                "Solo se pueden finalizar turnos que estén en atención."
            )

        documentacion = db.scalar(
            select(DocumentacionTurno).where(
                DocumentacionTurno.turno_id == turno_id
            )
        )

        if documentacion is None:
            raise ValueError(
                "No se puede finalizar el turno sin documentar "
                "la atención previamente."
            )

        estado_anterior = turno.estado
        turno.estado = "finalizado"
        turno.finalizado_en = datetime.now().astimezone()

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo="finalizado",
                motivo=(
                    "Atención finalizada con documentación registrada."
                ),
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise


def documentar_turno(
    db: Session,
    turno_id: int,
    tipo_tramite: str,
    observacion: str,
) -> DocumentacionTurno:
    try:
        turno = db.scalar(
            select(Turno)
            .where(Turno.id == turno_id)
            .with_for_update()
        )

        if turno is None:
            raise ValueError("El turno no existe.")

        if turno.estado != "llamado":
            raise ValueError(
                "Solo se pueden documentar turnos en atención."
            )

        existente = db.scalar(
            select(DocumentacionTurno).where(
                DocumentacionTurno.turno_id == turno_id
            )
        )

        if existente is not None:
            raise ValueError(
                "Este turno ya tiene una documentación registrada."
            )

        tipo_tramite = tipo_tramite.strip()
        observacion = observacion.strip()

        if len(tipo_tramite) < 2:
            raise ValueError("Indica un tipo de trámite válido.")

        if len(observacion) < 3:
            raise ValueError(
                "La observación debe tener al menos 3 caracteres."
            )

        documentacion = DocumentacionTurno(
            turno_id=turno_id,
            tipo_tramite=tipo_tramite,
            observacion=observacion,
        )

        db.add(documentacion)
        db.commit()
        db.refresh(documentacion)
        return documentacion

    except Exception:
        db.rollback()
        raise


def obtener_documentacion_turno(
    db: Session,
    turno_id: int,
) -> DocumentacionTurno | None:
    return db.scalar(
        select(DocumentacionTurno).where(
            DocumentacionTurno.turno_id == turno_id
        )
    )
