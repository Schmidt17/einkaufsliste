FROM tiangolo/uwsgi-nginx-flask:python3.7

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

ENV STATIC_PATH /app/static
