
from typing import Literal

from pydantic import BaseModel, Field


class TurnoCrear(BaseModel):
    sucursal_id: int = Field(gt=0)
    servicio_id: int = Field(gt=0)
    prioridad: Literal[
    "Normal",
    "Preferencial",
    "Turno_Virtual",
    ] = "Normal"
    origen: Literal["MPC", "virtual"] = "MPC"


class TurnoRespuesta(BaseModel):
    id: int
    codigo: str
    sucursal_id: int
    servicio_id: int
    fecha_operativa: str
    numero_diario: int
    prioridad: str
    estado: str
    origen: str


class LlamadoTurnoRespuesta(BaseModel):
    id: int
    codigo: str
    sucursal_id: int
    servicio_id: int
    modulo: str
    estado: str
    llamado_en: str

class DocumentacionTurnoCrear(BaseModel):
    tipo_tramite: str = Field(min_length=2, max_length=100)
    observacion: str = Field(min_length=3, max_length=2000)


class DocumentacionTurnoRespuesta(BaseModel):
    id: int
    turno_id: int
    tipo_tramite: str
    observacion: str
    documentado_en: str