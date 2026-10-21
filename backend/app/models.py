
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Entidad(Base):
    __tablename__ = "entidades"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    nombre: Mapped[str] = mapped_column(
        String(150), nullable=False
    )
    nombre_comercial: Mapped[str | None] = mapped_column(
        String(150), nullable=True
    )
    identificador_legal: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    estado: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class Sucursal(Base):
    __tablename__ = "sucursales"

    __table_args__ = (
        UniqueConstraint(
            "entidad_id",
            "codigo",
            name="uq_sucursales_entidad_codigo",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    entidad_id: Mapped[int] = mapped_column(
        ForeignKey("entidades.id"),
        nullable=False,
        index=True,
    )
    codigo: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    nombre: Mapped[str] = mapped_column(
        String(150), nullable=False
    )
    departamento: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    ciudad: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    direccion: Mapped[str | None] = mapped_column(
        String(250), nullable=True
    )
    zona_horaria: Mapped[str] = mapped_column(
        String(60),
        default="America/Bogota",
        nullable=False,
    )
    estado: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )


class Servicio(Base):
    __tablename__ = "servicios"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    codigo_interno: Mapped[str] = mapped_column(
        String(40), unique=True, nullable=False
    )
    nombre: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    descripcion: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    categoria: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    estado: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )


class ServicioSucursal(Base):
    __tablename__ = "servicios_sucursal"

    __table_args__ = (
        UniqueConstraint(
            "sucursal_id",
            "servicio_id",
            name="uq_servicios_sucursal",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    sucursal_id: Mapped[int] = mapped_column(
        ForeignKey("sucursales.id"),
        nullable=False,
        index=True,
    )
    servicio_id: Mapped[int] = mapped_column(
        ForeignKey("servicios.id"),
        nullable=False,
        index=True,
    )
    habilitado: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    prefijo_turno: Mapped[str] = mapped_column(
        String(10), nullable=False
    )
    atiende_dolares: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    configuracion_json: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )


class Turno(Base):
    __tablename__ = "turnos"

    __table_args__ = (
        # Cada prioridad tiene su propia secuencia diaria.
        UniqueConstraint(
            "sucursal_id",
            "servicio_id",
            "fecha_operativa",
            "prioridad",
            "numero_diario",
            name="uq_turno_secuencia_diaria",
        ),
        CheckConstraint(
            "numero_diario > 0",
            name="ck_turno_numero_diario_positivo",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    sucursal_id: Mapped[int] = mapped_column(
        ForeignKey("sucursales.id"),
        nullable=False,
        index=True,
    )

    servicio_id: Mapped[int] = mapped_column(
        ForeignKey("servicios.id"),
        nullable=False,
        index=True,
    )

    codigo: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    fecha_operativa: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    numero_diario: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    prioridad: Mapped[str] = mapped_column(
        String(30),
        default="Normal",
        nullable=False,
    )

    estado: Mapped[str] = mapped_column(
        String(30),
        default="en_espera",
        nullable=False,
        index=True,
    )

    origen: Mapped[str] = mapped_column(
        String(30),
        default="kiosco",
        nullable=False,
    )

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    modulo: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    llamado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    atencion_iniciada_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    finalizado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    ausente_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class HistorialTurno(Base):
    __tablename__ = "historial_turnos"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    turno_id: Mapped[int] = mapped_column(
        ForeignKey("turnos.id"),
        nullable=False,
        index=True,
    )

    estado_anterior: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    estado_nuevo: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    motivo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    cambiado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class DocumentacionTurno(Base):
    __tablename__ = "documentaciones_turno"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    turno_id: Mapped[int] = mapped_column(
        ForeignKey("turnos.id"),
        nullable=False,
        unique=True,
        index=True,
    )

    tipo_tramite: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    observacion: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    documentado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
