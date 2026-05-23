import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.passwords import hash_password, verify_password
from app.core.security import issue_token
from app.models import Org, User

router = APIRouter()


class SignupIn(BaseModel):
    email: EmailStr
    password: str
    org_name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    org_id: str


@router.post("/signup", response_model=TokenOut)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    org = Org(id=uuid.uuid4(), name=body.org_name)
    user = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add_all([org, user])
    db.commit()
    return TokenOut(access_token=issue_token(str(user.id), str(org.id)), org_id=str(org.id))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad credentials")
    return TokenOut(access_token=issue_token(str(user.id), str(user.org_id)), org_id=str(user.org_id))
