#services/turnos.py
from datetime import datetime, timedelta
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
    tipo_documento: str | None = None,
    numero_documento: str | None = None,
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

    # Validar y normalizar el documento.
    if (tipo_documento is None) != (numero_documento is None):
        raise ValueError(
            "Debes proporcionar el tipo y número de documento."
        )

    if tipo_documento is not None:
        tipo_documento = tipo_documento.strip()
        numero_documento = numero_documento.strip()

        if not tipo_documento or not numero_documento:
            raise ValueError(
                "El tipo y número de documento son obligatorios."
            )

        # Comprobar si ya existe un turno activo para la persona.
        turno_existente = db.scalar(
            select(Turno.id)
            .where(
                Turno.tipo_documento == tipo_documento,
                Turno.numero_documento == numero_documento,
                Turno.estado.in_(
                    ["en_espera", "llamado", "retenido"]
                ),
            )
            .limit(1)
        )

        if turno_existente is not None:
            raise ValueError(
                "Este documento ya tiene un turno activo."
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

        # Obtener el último número de esta prioridad.
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

        # Diferenciar el código según la prioridad.
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
            tipo_documento=tipo_documento,
            numero_documento=numero_documento,
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
    """Marca como ausente un turno operativo y libera el módulo si estaba llamado."""
    estados_permitidos = {"en_espera", "llamado", "retenido"}

    try:
        turno = db.scalar(
            select(Turno)
            .where(Turno.id == turno_id)
            .with_for_update()
        )

        if turno is None:
            raise ValueError("El turno no existe.")

        if turno.estado not in estados_permitidos:
            raise ValueError(
                f"No se puede marcar como ausente un turno en estado '{turno.estado}'."
            )

        estado_anterior = turno.estado
        modulo_anterior = turno.modulo
        turno.estado = "ausente"
        turno.ausente_en = datetime.now().astimezone()

        # Si estaba llamado, liberar el módulo para que pueda atender otro turno.
        if estado_anterior == "llamado":
            turno.modulo = None
            turno.llamado_en = None
            turno.atencion_iniciada_en = None

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo="ausente",
                motivo=(
                    "Marcado como ausente desde la consola de atención. "
                    f"Módulo liberado: {modulo_anterior or 'no asignado'}."
                ),
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
            if not turno.modulo:
                raise ValueError("El turno retenido no tiene un módulo asignado.")
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



def consultar_turno_por_documento(
    db: Session,
    tipo_documento: str,
    numero_documento: str,
) -> Turno | None:
    tipo_documento = tipo_documento.strip()
    numero_documento = numero_documento.strip()

    if not tipo_documento or not numero_documento:
        raise ValueError(
            "El tipo y número de documento son obligatorios."
        )

    return db.scalar(
        select(Turno)
        .where(
            Turno.tipo_documento == tipo_documento,
            Turno.numero_documento == numero_documento,
            Turno.estado.in_(
                [
                    "reservado",
                    "en_espera",
                    "llamado",
                    "retenido",
                    "congelado",
                ]
            ),
        )
        .order_by(Turno.creado_en.desc())
        .limit(1)
    )




def reservar_turno_virtual(
    db: Session,
    sucursal_id: int,
    servicio_id: int,
    tipo_documento: str,
    numero_documento: str,
    celular: str,
    fecha_hora_programada: datetime,
) -> Turno:
    """Crea una reserva con código definitivo, sin entrar en espera."""

    try:
        tipo_documento = tipo_documento.strip()
        numero_documento = numero_documento.strip()
        celular = celular.strip()

        if not tipo_documento or not numero_documento or not celular:
            raise ValueError(
                "El documento y el celular son obligatorios."
            )

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

        zona = ZoneInfo(sucursal.zona_horaria)
        ahora = datetime.now(zona)

        if fecha_hora_programada.tzinfo is None:
            # Interpretar las horas sin zona como hora local de la sucursal.
            fecha_hora_programada = fecha_hora_programada.replace(
                tzinfo=zona
            )
        else:
            fecha_hora_programada = fecha_hora_programada.astimezone(
                zona
            )

        if fecha_hora_programada <= ahora:
            raise ValueError(
                "La fecha y hora de la reserva deben ser futuras."
            )

        # Evitar reservas duplicadas para el mismo documento.
        turno_existente = db.scalar(
            select(Turno.id)
            .where(
                Turno.tipo_documento == tipo_documento,
                Turno.numero_documento == numero_documento,
                Turno.estado.in_(
                    [
                        "reservado",
                        "en_espera",
                        "llamado",
                        "retenido",
                        "congelado",
                    ]
                ),
            )
            .limit(1)
        )

        if turno_existente is not None:
            raise ValueError(
                "Este documento ya tiene un turno activo o reservado."
            )

        prioridad = PRIORIDAD_VIRTUAL
        fecha_operativa = fecha_hora_programada.date()

        # Serializar la generación del código para evitar duplicados.
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

        codigo = f"{configuracion.prefijo_turno}V{numero_diario:03d}"

        turno = Turno(
            sucursal_id=sucursal_id,
            servicio_id=servicio_id,
            codigo=codigo,
            fecha_operativa=fecha_operativa,
            numero_diario=numero_diario,
            prioridad=prioridad,
            estado="reservado",
            origen="virtual",
            tipo_documento=tipo_documento,
            numero_documento=numero_documento,
            celular=celular,
            fecha_hora_programada=fecha_hora_programada,
        )

        db.add(turno)
        db.flush()

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=None,
                estado_nuevo="reservado",
                motivo=(
                    "Reserva virtual creada. "
                    f"Fecha programada: {fecha_hora_programada.isoformat()}."
                ),
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise



def activar_turno_virtual(
    db: Session,
    tipo_documento: str,
    numero_documento: str,
) -> Turno:
    """Activa una reserva virtual dentro de su ventana permitida."""

    try:
        tipo_documento = tipo_documento.strip()
        numero_documento = numero_documento.strip()

        turno = db.scalar(
            select(Turno)
            .where(
                Turno.tipo_documento == tipo_documento,
                Turno.numero_documento == numero_documento,
                Turno.origen == "virtual",
                Turno.estado == "reservado",
            )
            .order_by(Turno.creado_en.desc())
            .with_for_update()
            .limit(1)
        )

        if turno is None:
            raise ValueError(
                "No se encontró una reserva virtual pendiente "
                "para este documento."
            )

        if turno.fecha_hora_programada is None:
            raise ValueError(
                "La reserva no tiene una fecha y hora programadas."
            )

        sucursal = db.get(Sucursal, turno.sucursal_id)

        if sucursal is None:
            raise ValueError("No se encontró la sucursal de la reserva.")

        zona = ZoneInfo(sucursal.zona_horaria)
        ahora = datetime.now(zona)
        programada = turno.fecha_hora_programada

        if programada.tzinfo is None:
            programada = programada.replace(tzinfo=zona)
        else:
            programada = programada.astimezone(zona)

        inicio_activacion = programada - timedelta(minutes=10)
        fin_activacion = programada + timedelta(minutes=30)

        if ahora < inicio_activacion:
            minutos = max(
                1,
                int((inicio_activacion - ahora).total_seconds() // 60),
            )
            raise ValueError(
                f"Tu turno todavía no se puede activar. "
                f"Inténtalo aproximadamente en {minutos} minuto(s)."
            )

        if ahora > fin_activacion:
            estado_anterior = turno.estado
            turno.estado = "ausente"
            turno.ausente_en = ahora

            db.add(
                HistorialTurno(
                    turno_id=turno.id,
                    estado_anterior=estado_anterior,
                    estado_nuevo="ausente",
                    motivo=(
                        "Reserva virtual vencida sin activación."
                    ),
                )
            )
            db.commit()

            raise ValueError(
                "El plazo para activar tu reserva venció. "
                "La reserva quedó marcada como ausente."
            )

        estado_anterior = turno.estado
        turno.estado = "en_espera"

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo="en_espera",
                motivo="El cliente activó su reserva virtual.",
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except ValueError:
        # Si la reserva venció, su cambio ya se confirmó en la base.
        # No deshacer ese cambio.
        if db.in_transaction():
            db.rollback()
        raise

    except Exception:
        db.rollback()
        raise


def congelar_turno_virtual(
    db: Session,
    tipo_documento: str,
    numero_documento: str,
) -> Turno:
    """Congela un turno virtual activado durante un máximo de 30 minutos."""

    try:
        turno = db.scalar(
            select(Turno)
            .where(
                Turno.tipo_documento == tipo_documento.strip(),
                Turno.numero_documento == numero_documento.strip(),
                Turno.origen == "virtual",
                Turno.estado == "en_espera",
            )
            .order_by(Turno.creado_en.desc())
            .with_for_update()
            .limit(1)
        )

        if turno is None:
            raise ValueError(
                "No se encontró un turno virtual activado "
                "que pueda congelarse."
            )

        sucursal = db.get(Sucursal, turno.sucursal_id)
        if sucursal is None:
            raise ValueError("No se encontró la sucursal del turno.")

        ahora = datetime.now(ZoneInfo(sucursal.zona_horaria))
        estado_anterior = turno.estado

        turno.estado = "congelado"
        turno.congelado_en = ahora

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=estado_anterior,
                estado_nuevo="congelado",
                motivo="El cliente congeló su turno virtual.",
            )
        )

        db.commit()
        db.refresh(turno)
        return turno

    except Exception:
        db.rollback()
        raise


def descongelar_turno_virtual(
    db: Session,
    tipo_documento: str,
    numero_documento: str,
) -> Turno:
    """Devuelve a espera un turno congelado dentro del plazo."""

    try:
        turno = db.scalar(
            select(Turno)
            .where(
                Turno.tipo_documento == tipo_documento.strip(),
                Turno.numero_documento == numero_documento.strip(),
                Turno.origen == "virtual",
                Turno.estado == "congelado",
            )
            .order_by(Turno.creado_en.desc())
            .with_for_update()
            .limit(1)
        )

        if turno is None:
            raise ValueError(
                "No se encontró un turno virtual congelado."
            )

        sucursal = db.get(Sucursal, turno.sucursal_id)
        if sucursal is None:
            raise ValueError("No se encontró la sucursal del turno.")

        zona = ZoneInfo(sucursal.zona_horaria)
        ahora = datetime.now(zona)

        if turno.congelado_en is None:
            raise ValueError(
                "El turno no tiene registrada la hora de congelación."
            )

        congelado_en = turno.congelado_en
        if congelado_en.tzinfo is None:
            congelado_en = congelado_en.replace(tzinfo=zona)
        else:
            congelado_en = congelado_en.astimezone(zona)

        estado_anterior = turno.estado

        if ahora > congelado_en + timedelta(minutes=30):
            turno.estado = "ausente"
            turno.ausente_en = ahora
            motivo = (
                "El turno congelado venció sin ser descongelado "
                "dentro de los 30 minutos permitidos."
            )
        else:
            turno.estado = "en_espera"
            motivo = "El cliente descongeló su turno virtual."

        turno.congelado_en = None

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

        if turno.estado == "ausente":
            raise ValueError(
                "El plazo de congelación venció. "
                "El turno quedó marcado como ausente."
            )

        return turno

    except ValueError:
        if db.in_transaction():
            db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


def procesar_vencimientos_virtuales(db: Session) -> int:
    """Marca como ausentes reservas y congelaciones vencidas."""

    procesados = 0

    try:
        ahora_utc = datetime.now().astimezone()

        turnos = list(
            db.scalars(
                select(Turno)
                .where(
                    (
                        (Turno.origen == "virtual")
                        & (Turno.estado == "reservado")
                        & (Turno.fecha_hora_programada.is_not(None))
                    )
                    |
                    (
                        (Turno.origen == "virtual")
                        & (Turno.estado == "congelado")
                        & (Turno.congelado_en.is_not(None))
                    )
                )
                .with_for_update(skip_locked=True)
            ).all()
        )

        for turno in turnos:
            sucursal = db.get(Sucursal, turno.sucursal_id)
            if sucursal is None:
                continue

            zona = ZoneInfo(sucursal.zona_horaria)
            ahora = datetime.now(zona)
            motivo = None

            if turno.estado == "reservado":
                programada = turno.fecha_hora_programada
                if programada.tzinfo is None:
                    programada = programada.replace(tzinfo=zona)
                else:
                    programada = programada.astimezone(zona)

                if ahora > programada + timedelta(minutes=30):
                    motivo = (
                        "Reserva virtual vencida sin activación."
                    )

            elif turno.estado == "congelado":
                congelado_en = turno.congelado_en
                if congelado_en.tzinfo is None:
                    congelado_en = congelado_en.replace(tzinfo=zona)
                else:
                    congelado_en = congelado_en.astimezone(zona)

                if ahora > congelado_en + timedelta(minutes=30):
                    motivo = (
                        "El turno congelado superó los 30 minutos "
                        "permitidos."
                    )

            if motivo:
                estado_anterior = turno.estado
                turno.estado = "ausente"
                turno.ausente_en = ahora
                turno.congelado_en = None

                db.add(
                    HistorialTurno(
                        turno_id=turno.id,
                        estado_anterior=estado_anterior,
                        estado_nuevo="ausente",
                        motivo=motivo,
                    )
                )
                procesados += 1

        db.commit()
        return procesados

    except Exception:
        db.rollback()
        raise



def trasladar_turno(
    db: Session,
    turno_id: int,
    nuevo_servicio_id: int,
    motivo: str | None = None,
) -> Turno:
    """Traslada un turno conservando su código y registrando el motivo."""
    try:
        turno = db.scalar(
            select(Turno)
            .where(Turno.id == turno_id)
            .with_for_update()
        )

        if turno is None:
            raise ValueError("El turno no existe.")

        if turno.estado not in {"en_espera", "llamado", "retenido"}:
            raise ValueError(
                "Solo se pueden trasladar turnos operativos."
            )

        if turno.servicio_id == nuevo_servicio_id:
            raise ValueError(
                "El turno ya pertenece a ese servicio."
            )

        nuevo_servicio = db.scalar(
            select(Servicio)
            .join(
                ServicioSucursal,
                ServicioSucursal.servicio_id == Servicio.id,
            )
            .where(
                Servicio.id == nuevo_servicio_id,
                Servicio.estado.is_(True),
                ServicioSucursal.sucursal_id == turno.sucursal_id,
                ServicioSucursal.habilitado.is_(True),
            )
        )

        if nuevo_servicio is None:
            raise ValueError(
                "El servicio destino no está habilitado en esta sucursal."
            )

        motivo = (motivo or "").strip()

        if len(motivo) > 500:
            raise ValueError(
                "El motivo del traslado no puede superar 500 caracteres."
            )

        anterior_id = turno.servicio_id
        anterior_estado = turno.estado
        anterior_modulo = turno.modulo
        anterior = db.get(Servicio, anterior_id)

        nombre_anterior = (
            anterior.nombre if anterior else f"Servicio {anterior_id}"
        )

        detalle_motivo = (
            f"Traslado de servicio: {nombre_anterior} "
            f"(ID {anterior_id}) -> {nuevo_servicio.nombre} "
            f"(ID {nuevo_servicio_id}). "
            f"Código conservado: {turno.codigo}. "
            f"Módulo anterior: {anterior_modulo or 'sin módulo'}. "
            f"Motivo del operador: "
            f"{motivo or 'No especificado'}."
        )

        # El turno vuelve a la fila de espera del servicio destino.
        # Su identificador y código original se conservan.
        turno.servicio_id = nuevo_servicio_id
        turno.estado = "en_espera"
        turno.modulo = None
        turno.llamado_en = None
        turno.atencion_iniciada_en = None

        db.add(
            HistorialTurno(
                turno_id=turno.id,
                estado_anterior=anterior_estado,
                estado_nuevo="en_espera",
                motivo=detalle_motivo,
            )
        )

        db.commit()
        db.refresh(turno)

        return turno

    except Exception:
        db.rollback()
        raise



def consultar_historial_turno(
    db: Session,
    codigo: str | None = None,
    tipo_documento: str | None = None,
    numero_documento: str | None = None,
) -> dict | None:
    """Consulta un turno y sus eventos por código o por documento."""
    consulta = select(Turno)
    if codigo:
        consulta = consulta.where(func.upper(Turno.codigo) == codigo.strip().upper())
    elif tipo_documento and numero_documento:
        consulta = consulta.where(
            Turno.tipo_documento == tipo_documento,
            Turno.numero_documento == numero_documento.strip(),
        )
    else:
        raise ValueError("Indica el código del turno o el tipo y número de documento.")

    turno = db.scalar(consulta.order_by(Turno.creado_en.desc()).limit(1))
    if turno is None:
        return None

    historial = list(db.scalars(
        select(HistorialTurno)
        .where(HistorialTurno.turno_id == turno.id)
        .order_by(HistorialTurno.cambiado_en.asc(), HistorialTurno.id.asc())
    ).all())
    servicio = db.get(Servicio, turno.servicio_id)
    return {
        "turno": {
            "id": turno.id,
            "codigo": turno.codigo,
            "sucursal_id": turno.sucursal_id,
            "servicio_id": turno.servicio_id,
            "servicio": servicio.nombre if servicio else None,
            "prioridad": turno.prioridad,
            "estado": turno.estado,
            "origen": turno.origen,
            "creado_en": turno.creado_en.isoformat() if turno.creado_en else None,
            "llamado_en": turno.llamado_en.isoformat() if turno.llamado_en else None,
            "finalizado_en": turno.finalizado_en.isoformat() if turno.finalizado_en else None,
        },
        "historial": [
            {
                "estado_anterior": evento.estado_anterior,
                "estado_nuevo": evento.estado_nuevo,
                "motivo": evento.motivo,
                "cambiado_en": evento.cambiado_en.isoformat() if evento.cambiado_en else None,
            }
            for evento in historial
        ],
    }


def obtener_tiempos_espera(db: Session, sucursal_id: int) -> list[dict]:
    """Devuelve el turno más antiguo y el tiempo de espera por servicio."""
    servicios = list(db.scalars(
        select(Servicio)
        .join(ServicioSucursal, ServicioSucursal.servicio_id == Servicio.id)
        .where(
            Servicio.estado.is_(True),
            ServicioSucursal.sucursal_id == sucursal_id,
            ServicioSucursal.habilitado.is_(True),
        )
        .order_by(Servicio.nombre.asc())
    ).all())
    ahora = datetime.now().astimezone()
    resultado = []
    for servicio in servicios:
        primero = db.scalar(
            select(Turno)
            .where(
                Turno.sucursal_id == sucursal_id,
                Turno.servicio_id == servicio.id,
                Turno.estado == "en_espera",
            )
            .order_by(Turno.creado_en.asc())
            .limit(1)
        )
        minutos = None
        if primero and primero.creado_en:
            creado = primero.creado_en
            if creado.tzinfo is None:
                creado = creado.replace(tzinfo=ahora.tzinfo)
            minutos = max(0, int((ahora - creado).total_seconds() // 60))
        resultado.append({
            "servicio_id": servicio.id,
            "servicio": servicio.nombre,
            "turno_codigo": primero.codigo if primero else None,
            "creado_en": primero.creado_en.isoformat() if primero and primero.creado_en else None,
            "minutos_espera": minutos,
        })
    return resultado
