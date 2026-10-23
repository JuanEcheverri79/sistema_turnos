#schemas/turnos.py
from datetime import datetime

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class TurnoCrear(BaseModel):
    sucursal_id: int = Field(gt=0)
    servicio_id: int = Field(gt=0)

    prioridad: Literal[
        "Normal",
        "Preferencial",
        "Turno_Virtual",
    ] = "Normal"

    origen: Literal["MPC", "virtual"] = "MPC"

    tipo_documento: Literal[
        "Cédula de ciudadanía",
        "Cédula de extranjería",
        "Pasaporte",
        "Tarjeta de identidad",
        "Registro civil",
        "Documento venezolano",
    ] | None = None

    numero_documento: str | None = Field(
        default=None,
        min_length=1,
        max_length=30,
    )

    @field_validator("tipo_documento", "numero_documento")
    @classmethod
    def limpiar_documento(cls, valor):
        if isinstance(valor, str):
            valor = valor.strip()
            if not valor:
                raise ValueError("El documento no puede estar vacío.")
        return valor

    @field_validator("numero_documento")
    @classmethod
    def validar_numero_documento(cls, valor):
        if valor is not None and len(valor) > 30:
            raise ValueError(
                "El número de documento no puede superar 30 caracteres."
            )
        return valor


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


class ConsultaTurnoDocumento(BaseModel):
    tipo_documento: Literal[
        "Cédula de ciudadanía",
        "Cédula de extranjería",
        "Pasaporte",
        "Tarjeta de identidad",
        "Registro civil",
        "Documento venezolano",
    ]

    numero_documento: str = Field(
        min_length=1,
        max_length=30,
    )

    @field_validator("tipo_documento", "numero_documento")
    @classmethod
    def limpiar_valores(cls, valor):
        valor = valor.strip()

        if not valor:
            raise ValueError("Este campo es obligatorio.")

        return valor

class TurnoVirtualReservar(BaseModel):
    sucursal_id: int = Field(gt=0)
    servicio_id: int = Field(gt=0)

    tipo_documento: Literal[
        "Cédula de ciudadanía",
        "Cédula de extranjería",
        "Pasaporte",
        "Tarjeta de identidad",
        "Registro civil",
        "Documento venezolano",
    ]

    numero_documento: str = Field(min_length=1, max_length=30)
    celular: str = Field(min_length=7, max_length=20)
    fecha_hora_programada: datetime
    acepta_terminos: bool

    @field_validator("tipo_documento", "numero_documento", "celular")
    @classmethod
    def limpiar_cadenas(cls, valor):
        valor = valor.strip()
        if not valor:
            raise ValueError("Este campo es obligatorio.")
        return valor

    @field_validator("acepta_terminos")
    @classmethod
    def validar_terminos(cls, valor):
        if not valor:
            raise ValueError("Debes aceptar los términos y condiciones.")
        return valor


class AccionTurnoVirtual(BaseModel):
    tipo_documento: Literal[
        "Cédula de ciudadanía",
        "Cédula de extranjería",
        "Pasaporte",
        "Tarjeta de identidad",
        "Registro civil",
        "Documento venezolano",
    ]
    numero_documento: str = Field(min_length=1, max_length=30)

    @field_validator("tipo_documento", "numero_documento")
    @classmethod
    def limpiar_cadenas(cls, valor):
        valor = valor.strip()
        if not valor:
            raise ValueError("Este campo es obligatorio.")
        return valor
