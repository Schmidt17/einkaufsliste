FROM arm32v7/python:3.9 as base-prod

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

COPY ./pip.conf /etc/pip.conf

RUN python3 -m pip install --upgrade pip
RUN python3 -m pip install --upgrade gunicorn

COPY requirements.txt /tmp/
RUN python3 -m pip install --no-cache-dir --only-binary=:all: -r /tmp/requirements.txt

ENV STATIC_PATH /app/static

CMD gunicorn --bind 0.0.0.0:80 main:app

