from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.auth import requerir_operador
from app.core.database import get_db
from app.models import DocumentacionTurno, HistorialTurno, Turno, Servicio, ServicioSucursal, Sucursal
from app.schemas.turno import (
    TurnoCrear,
    TurnoRespuesta,
    LlamadoTurnoRespuesta,
    DocumentacionTurnoCrear,
    DocumentacionTurnoRespuesta,
    ConsultaTurnoDocumento,
    TurnoVirtualReservar,
    AccionTurnoVirtual,
)
from app.services.turnos import (
    generar_turno,
    listar_turnos,
    obtener_turno_por_id,
    llamar_siguiente_turno,
    marcar_turno_ausente,
    retener_turno,
    reactivar_turno,
    finalizar_turno,
    documentar_turno,
    obtener_documentacion_turno,
    consultar_turno_por_documento,
    reservar_turno_virtual,
    activar_turno_virtual,
    congelar_turno_virtual,
    descongelar_turno_virtual,
    procesar_vencimientos_virtuales,
    trasladar_turno,
    consultar_historial_turno,
    obtener_tiempos_espera,
)

from sqlalchemy.exc import IntegrityError

class TrasladarTurnoSolicitud(BaseModel):
    nuevo_servicio_id: int = Field(gt=0)
    motivo: str | None = None


router = APIRouter(
    prefix="/turnos",
    tags=["Turnos"],
)


@router.post(
    "/",
    response_model=TurnoRespuesta,
    status_code=status.HTTP_201_CREATED,
)
def crear_turno(
    datos: TurnoCrear,
    db: Session = Depends(get_db),
):
    try:
        turno = generar_turno(
            db=db,
            sucursal_id=datos.sucursal_id,
            servicio_id=datos.servicio_id,
            prioridad=datos.prioridad,
            origen=datos.origen,
            tipo_documento=datos.tipo_documento,
            numero_documento=datos.numero_documento,
        )

        return TurnoRespuesta(
            id=turno.id,
            codigo=turno.codigo,
            sucursal_id=turno.sucursal_id,
            servicio_id=turno.servicio_id,
            fecha_operativa=turno.fecha_operativa.isoformat(),
            numero_diario=turno.numero_diario,
            prioridad=turno.prioridad,
            estado=turno.estado,
            origen=turno.origen,
            modulo=turno.modulo,
            llamado_en=turno.llamado_en.isoformat() if turno.llamado_en else None,
            creado_en=turno.creado_en.isoformat() if turno.creado_en else None,
        )

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este documento ya tiene un turno activo. "
                "Consulta tu turno antes de solicitar otro."
            ),
        ) from error


@router.post(
    "/virtual/reservar",
    status_code=status.HTTP_201_CREATED,
)
def crear_reserva_virtual(
    datos: TurnoVirtualReservar,
    db: Session = Depends(get_db),
):
    if not datos.acepta_terminos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes aceptar los términos y condiciones.",
        )

    try:
        turno = reservar_turno_virtual(
            db=db,
            sucursal_id=datos.sucursal_id,
            servicio_id=datos.servicio_id,
            tipo_documento=datos.tipo_documento,
            numero_documento=datos.numero_documento,
            celular=datos.celular,
            fecha_hora_programada=datos.fecha_hora_programada,
        )

        return {
            "mensaje": (
                "Reserva creada correctamente. "
                "Recuerda que esto no es una cita y debes activar "
                "tu turno dentro del horario permitido."
            ),
            "turno": {
                "id": turno.id,
                "codigo": turno.codigo,
                "sucursal_id": turno.sucursal_id,
                "servicio_id": turno.servicio_id,
                "prioridad": turno.prioridad,
                "estado": turno.estado,
                "origen": turno.origen,
                "fecha_hora_programada": (
                    turno.fecha_hora_programada.isoformat()
                    if turno.fecha_hora_programada
                    else None
                ),
            },
            "reglas_activacion": {
                "minutos_antes": 10,
                "minutos_despues": 30,
            },
        }

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este documento ya tiene un turno activo o reservado. "
                "Consulta tu turno antes de solicitar otro."
            ),
        ) from error


@router.post("/virtual/activar")
def activar_reserva_virtual(
    datos: AccionTurnoVirtual,
    db: Session = Depends(get_db),
):
    try:
        turno = activar_turno_virtual(
            db=db,
            tipo_documento=datos.tipo_documento,
            numero_documento=datos.numero_documento,
        )

        return {
            "mensaje": "Tu turno virtual fue activado correctamente.",
            "turno": {
                "id": turno.id,
                "codigo": turno.codigo,
                "estado": turno.estado,
                "sucursal_id": turno.sucursal_id,
                "servicio_id": turno.servicio_id,
                "prioridad": turno.prioridad,
            },
        }

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


@router.post("/virtual/congelar")
def congelar_reserva_virtual(
    datos: AccionTurnoVirtual,
    db: Session = Depends(get_db),
):
    try:
        turno = congelar_turno_virtual(
            db,
            datos.tipo_documento,
            datos.numero_documento,
        )
        return {
            "mensaje": "Tu turno quedó congelado durante un máximo de 30 minutos.",
            "turno": {
                "id": turno.id,
                "codigo": turno.codigo,
                "estado": turno.estado,
                "congelado_en": (
                    turno.congelado_en.isoformat()
                    if turno.congelado_en else None
                ),
            },
        }
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


@router.post("/virtual/descongelar")
def descongelar_reserva_virtual(
    datos: AccionTurnoVirtual,
    db: Session = Depends(get_db),
):
    try:
        turno = descongelar_turno_virtual(
            db,
            datos.tipo_documento,
            datos.numero_documento,
        )
        return {
            "mensaje": "Tu turno volvió a la fila de espera.",
            "turno": {
                "id": turno.id,
                "codigo": turno.codigo,
                "estado": turno.estado,
            },
        }
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


@router.post("/virtual/cancelar")
def cancelar_reserva_virtual(
    datos: AccionTurnoVirtual,
    db: Session = Depends(get_db),
):
    turno = (
        db.query(Turno)
        .filter(
            Turno.tipo_documento == datos.tipo_documento,
            Turno.numero_documento == datos.numero_documento,
            Turno.origen == "virtual",
            Turno.estado.in_(
                ["reservado", "en_espera", "congelado"]
            ),
        )
        .order_by(Turno.creado_en.desc())
        .first()
    )

    if turno is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No encontramos una reserva virtual que se pueda cancelar.",
        )

    turno.estado = "cancelado"
    db.commit()
    db.refresh(turno)

    return {
        "mensaje": "Tu reserva virtual fue cancelada correctamente.",
        "turno": {
            "id": turno.id,
            "codigo": turno.codigo,
            "estado": turno.estado,
        },
    }


@router.post("/consultar-documento")
def consultar_documento(
    datos: ConsultaTurnoDocumento,
    db: Session = Depends(get_db),
):
    procesar_vencimientos_virtuales(db)
    turno = consultar_turno_por_documento(
        db=db,
        tipo_documento=datos.tipo_documento,
        numero_documento=datos.numero_documento,
    )

    if turno is None:
        return {
            "tiene_turno_activo": False,
            "mensaje": "No tienes un turno activo.",
            "turno": None,
        }

    return {
        "tiene_turno_activo": True,
        "mensaje": "Ya tienes un turno activo.",
        
        "turno": {
            "id": turno.id,
            "codigo": turno.codigo,
            "sucursal_id": turno.sucursal_id,
            "servicio_id": turno.servicio_id,
            "prioridad": turno.prioridad,
            "estado": turno.estado,
            "origen": turno.origen,
            "creado_en": (
                turno.creado_en.isoformat()
                if turno.creado_en else None
            ),
            "fecha_hora_programada": (
                turno.fecha_hora_programada.isoformat()
                if turno.fecha_hora_programada else None
            ),
            "congelado_en": (
                turno.congelado_en.isoformat()
                if turno.congelado_en else None
            ),
            "puede_activar": turno.estado == "reservado",
            "puede_congelar": (
                turno.origen == "virtual"
                and turno.estado == "en_espera"
            ),
            "puede_descongelar": (
                turno.origen == "virtual"
                and turno.estado == "congelado"
            ),
        },

    }


@router.get(
    "/",
    response_model=list[TurnoRespuesta],
    dependencies=[Depends(requerir_operador)],
)
def consultar_turnos(
    sucursal_id: int | None = None,
    estado: str | None = None,
    servicio_id: int | None = None,
    db: Session = Depends(get_db),
):
    procesar_vencimientos_virtuales(db)
    return [
        TurnoRespuesta(
            id=turno.id,
            codigo=turno.codigo,
            sucursal_id=turno.sucursal_id,
            servicio_id=turno.servicio_id,
            fecha_operativa=turno.fecha_operativa.isoformat(),
            numero_diario=turno.numero_diario,
            prioridad=turno.prioridad,
            estado=turno.estado,
            origen=turno.origen,
            modulo=turno.modulo,
            llamado_en=turno.llamado_en.isoformat() if turno.llamado_en else None,
            creado_en=turno.creado_en.isoformat() if turno.creado_en else None,
        )
        for turno in listar_turnos(
            db=db,
            sucursal_id=sucursal_id,
            estado=estado,
            servicio_id=servicio_id,
        )
    ]


@router.get("/pantalla-publica")
def consultar_pantalla_publica(
    sucursal_id: int = 1,
    db: Session = Depends(get_db),
):
    procesar_vencimientos_virtuales(db)

    # Solo se muestran Caja (1) y Asesoría (2).
    servicios_publicos = [1, 2]

    # Turnos actualmente llamados y asignados a un módulo.
    turnos_actuales = (
        db.query(Turno)
        .filter(
            Turno.sucursal_id == sucursal_id,
            Turno.estado == "llamado",
            Turno.servicio_id.in_(servicios_publicos),
            Turno.modulo.isnot(None),
        )
        .order_by(Turno.modulo.asc())
        .all()
    )

    # Turnos pendientes de llamado.
    # El frontend mostrará como máximo tres por servicio.
    turnos_proximos = (
        db.query(Turno)
        .filter(
            Turno.sucursal_id == sucursal_id,
            Turno.estado == "en_espera",
            Turno.servicio_id.in_(servicios_publicos),
        )
        .order_by(Turno.creado_en.asc())
        .limit(30)
        .all()
    )

    # El panel derecho solo recibe turnos que siguen en atención.
    # Los finalizados, retenidos y ausentes quedan excluidos.
    turnos_en_atencion = (
        db.query(Turno)
        .filter(
            Turno.sucursal_id == sucursal_id,
            Turno.estado == "llamado",
            Turno.servicio_id.in_(servicios_publicos),
        )
        .order_by(Turno.llamado_en.desc())
        .all()
    )

    return {
        "sucursal_id": sucursal_id,

        "turnos_actuales": [
            {
                "id": turno.id,
                "codigo": turno.codigo,
                "servicio_id": turno.servicio_id,
                "modulo": turno.modulo,
                "llamado_en": (
                    turno.llamado_en.isoformat()
                    if turno.llamado_en
                    else None
                ),
            }
            for turno in turnos_actuales
        ],

        "turnos_proximos": [
            {
                "id": turno.id,
                "codigo": turno.codigo,
                "servicio_id": turno.servicio_id,
                "prioridad": turno.prioridad,
            }
            for turno in turnos_proximos
        ],

        "ultimos_llamados": [
            {
                "id": turno.id,
                "codigo": turno.codigo,
                "servicio_id": turno.servicio_id,
                "modulo": turno.modulo,
                "llamado_en": (
                    turno.llamado_en.isoformat()
                    if turno.llamado_en
                    else None
                ),
            }
            for turno in turnos_en_atencion
        ],
    }


# Solo disponible en desarrollo.
@router.delete(
    "/limpiar-todos",
    dependencies=[Depends(requerir_operador)],
)
def limpiar_todos_los_turnos(
    db: Session = Depends(get_db),
):
    if settings.environment.lower() != "development":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La limpieza masiva solo está disponible en desarrollo.",
        )

    try:
        db.execute(delete(DocumentacionTurno))
        db.execute(delete(HistorialTurno))
        resultado = db.execute(delete(Turno))
        eliminados = resultado.rowcount or 0
        db.commit()

        return {
            "mensaje": (
                f"Se eliminaron {eliminados} turnos, "
                "sus historiales y sus documentaciones."
            ),
            "turnos_eliminados": eliminados,
        }

    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible eliminar los turnos de prueba.",
        ) from error

@router.get("/catalogos/ubicaciones")
def consultar_ubicaciones(
    db: Session = Depends(get_db),
):
    sucursales = (
        db.query(Sucursal)
        .filter(Sucursal.estado.is_(True))
        .order_by(
            Sucursal.departamento,
            Sucursal.ciudad,
            Sucursal.nombre,
        )
        .all()
    )

    return [
        {
            "id": s.id,
            "nombre": s.nombre,
            "departamento": s.departamento,
            "municipio": s.ciudad,
            "direccion": s.direccion,
        }
        for s in sucursales
    ]


@router.get("/catalogos/servicios")
def consultar_servicios(
    sucursal_id: int | None = None,
    db: Session = Depends(get_db),
):
    consulta = db.query(Servicio).filter(
        Servicio.estado.is_(True)
    )

    if sucursal_id is not None:
        consulta = consulta.join(
            ServicioSucursal,
            ServicioSucursal.servicio_id == Servicio.id,
        ).filter(
            ServicioSucursal.sucursal_id == sucursal_id,
            ServicioSucursal.habilitado.is_(True),
        )

    servicios = consulta.order_by(Servicio.nombre).all()

    return [
        {
            "id": servicio.id,
            "nombre": servicio.nombre,
            "descripcion": servicio.descripcion,
            "categoria": servicio.categoria,
        }
        for servicio in servicios
    ]


@router.get("/tiempos-espera")
@router.get("/catalogos/tiempos-espera")
def consultar_tiempos_espera(
    sucursal_id: int = 1,
    db: Session = Depends(get_db),
):
    procesar_vencimientos_virtuales(db)
    return obtener_tiempos_espera(db, sucursal_id)


@router.post(
    "/{turno_id}/trasladar",
    dependencies=[Depends(requerir_operador)],
)
def trasladar(
    turno_id: int,
    datos: TrasladarTurnoSolicitud,
    db: Session = Depends(get_db),
):
    try:
        turno = trasladar_turno(
        db=db,
        turno_id=turno_id,
        nuevo_servicio_id=datos.nuevo_servicio_id,
        motivo=datos.motivo,
        )
        return {
            "id": turno.id,
            "codigo": turno.codigo,
            "servicio_id": turno.servicio_id,
            "estado": turno.estado,
            "mensaje": "Turno trasladado; se conservó su código y se registró el historial.",
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/consulta/historial")
def consultar_historial(
    codigo: str | None = None,
    tipo_documento: str | None = None,
    numero_documento: str | None = None,
    db: Session = Depends(get_db),
):
    procesar_vencimientos_virtuales(db)
    try:
        resultado = consultar_historial_turno(
            db, codigo=codigo, tipo_documento=tipo_documento,
            numero_documento=numero_documento,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if resultado is None:
        raise HTTPException(status_code=404, detail="No encontramos un turno con esos datos.")
    return resultado


@router.get(
    "/{turno_id}",
    response_model=TurnoRespuesta,
    dependencies=[Depends(requerir_operador)],
)
def consultar_turno(
    turno_id: int,
    db: Session = Depends(get_db),
):
    turno = obtener_turno_por_id(db, turno_id)

    if turno is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El turno no existe.",
        )

    return TurnoRespuesta(
        id=turno.id,
        codigo=turno.codigo,
        sucursal_id=turno.sucursal_id,
        servicio_id=turno.servicio_id,
        fecha_operativa=turno.fecha_operativa.isoformat(),
        numero_diario=turno.numero_diario,
        prioridad=turno.prioridad,
        estado=turno.estado,
        origen=turno.origen,
        modulo=turno.modulo,
        llamado_en=turno.llamado_en.isoformat() if turno.llamado_en else None,
        creado_en=turno.creado_en.isoformat() if turno.creado_en else None,
    )


@router.post(
    "/llamar-siguiente",
    dependencies=[Depends(requerir_operador)],
)
def llamar_siguiente(
    sucursal_id: int,
    servicio_id: int,
    modulo: str,
    db: Session = Depends(get_db),
):
    try:
        procesar_vencimientos_virtuales(db)
        turno = llamar_siguiente_turno(
            db=db,
            sucursal_id=sucursal_id,
            servicio_id=servicio_id,
            modulo=modulo,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    if turno is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay turnos en espera para este servicio.",
        )

    return {
        "id": turno.id,
        "codigo": turno.codigo,
        "sucursal_id": turno.sucursal_id,
        "servicio_id": turno.servicio_id,
        "modulo": turno.modulo,
        "estado": turno.estado,
        "llamado_en": turno.llamado_en.isoformat(),
    }


@router.post(
    "/{turno_id}/ausente",
    dependencies=[Depends(requerir_operador)],
)
def marcar_ausente(
    turno_id: int,
    db: Session = Depends(get_db),
):
    try:
        turno = marcar_turno_ausente(
            db=db,
            turno_id=turno_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return {
        "id": turno.id,
        "codigo": turno.codigo,
        "estado": turno.estado,
    }


@router.post(
    "/{turno_id}/retener",
    dependencies=[Depends(requerir_operador)],
)
def retener(
    turno_id: int,
    motivo: str,
    db: Session = Depends(get_db),
):
    try:
        turno = retener_turno(
            db=db,
            turno_id=turno_id,
            motivo=motivo,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return {
        "id": turno.id,
        "codigo": turno.codigo,
        "estado": turno.estado,
        "modulo": turno.modulo,
    }


@router.post(
    "/{turno_id}/reactivar",
    dependencies=[Depends(requerir_operador)],
)
def reactivar(
    turno_id: int,
    db: Session = Depends(get_db),
):
    try:
        turno = reactivar_turno(
            db=db,
            turno_id=turno_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return {
        "id": turno.id,
        "codigo": turno.codigo,
        "estado": turno.estado,
        "modulo": turno.modulo,
        "llamado_en": (
            turno.llamado_en.isoformat()
            if turno.llamado_en
            else None
        ),
    }


@router.post(
    "/{turno_id}/finalizar",
    dependencies=[Depends(requerir_operador)],
)
def finalizar(
    turno_id: int,
    db: Session = Depends(get_db),
):
    try:
        turno = finalizar_turno(
            db=db,
            turno_id=turno_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return {
        "id": turno.id,
        "codigo": turno.codigo,
        "estado": turno.estado,
        "modulo": turno.modulo,
        "finalizado_en": turno.finalizado_en.isoformat(),
    }


@router.post(
    "/{turno_id}/documentar",
    response_model=DocumentacionTurnoRespuesta,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(requerir_operador)],
)
def registrar_documentacion(
    turno_id: int,
    datos: DocumentacionTurnoCrear,
    db: Session = Depends(get_db),
):
    try:
        documentacion = documentar_turno(
            db=db,
            turno_id=turno_id,
            tipo_tramite=datos.tipo_tramite,
            observacion=datos.observacion,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return DocumentacionTurnoRespuesta(
        id=documentacion.id,
        turno_id=documentacion.turno_id,
        tipo_tramite=documentacion.tipo_tramite,
        observacion=documentacion.observacion,
        documentado_en=documentacion.documentado_en.isoformat(),
    )


@router.get(
    "/{turno_id}/documentacion",
    response_model=DocumentacionTurnoRespuesta,
    dependencies=[Depends(requerir_operador)],
)
def consultar_documentacion(
    turno_id: int,
    db: Session = Depends(get_db),
):
    turno = obtener_turno_por_id(db, turno_id)

    if turno is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El turno no existe.",
        )

    documentacion = obtener_documentacion_turno(
        db=db,
        turno_id=turno_id,
    )

    if documentacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El turno todavía no tiene documentación.",
        )

    return DocumentacionTurnoRespuesta(
        id=documentacion.id,
        turno_id=documentacion.turno_id,
        tipo_tramite=documentacion.tipo_tramite,
        observacion=documentacion.observacion,
        documentado_en=documentacion.documentado_en.isoformat(),
    )
