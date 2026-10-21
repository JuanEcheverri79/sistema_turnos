from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import DocumentacionTurno, HistorialTurno, Turno
from app.schemas.turno import (
    TurnoCrear,
    TurnoRespuesta,
    LlamadoTurnoRespuesta,
    DocumentacionTurnoCrear,
    DocumentacionTurnoRespuesta,
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
)

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
        )

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


@router.get("/", response_model=list[TurnoRespuesta])
def consultar_turnos(
    sucursal_id: int | None = None,
    estado: str | None = None,
    servicio_id: int | None = None,
    db: Session = Depends(get_db),
):
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
        )
        for turno in listar_turnos(
            db=db,
            sucursal_id=sucursal_id,
            estado=estado,
            servicio_id=servicio_id,
        )
    ]


# Debe declararse antes de /{turno_id}, para que la ruta estática
# no sea interpretada como un identificador de turno.
@router.delete("/limpiar-todos")
def limpiar_todos_los_turnos(
    db: Session = Depends(get_db),
):
    # Protección de desarrollo. En producción esta acción se bloquea.
    if settings.environment.lower() != "development":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La limpieza masiva solo está disponible en desarrollo.",
        )

    try:
        # Borrar primero las tablas dependientes para respetar las FK.
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


@router.get("/{turno_id}", response_model=TurnoRespuesta)
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
    )


@router.post("/llamar-siguiente")
def llamar_siguiente(
    sucursal_id: int,
    servicio_id: int,
    modulo: str,
    db: Session = Depends(get_db),
):
    try:
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


@router.post("/{turno_id}/ausente")
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


@router.post("/{turno_id}/retener")
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


@router.post("/{turno_id}/reactivar")
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


@router.post("/{turno_id}/finalizar")
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
