from flask import Flask, render_template, request
import redis
import re
import os
import json
from config import authorized_keys

#print(type(os.environ['FLASK_DEBUG']))

debug = False
if 'FLASK_DEBUG' in os.environ:
    debug = bool(os.environ['FLASK_DEBUG'])

app = Flask(__name__)

if debug:
    r = redis.Redis(host='localhost', port='6379', decode_responses=True)
else:
    r = redis.Redis(host='redis', port='6379', decode_responses=True)

@app.route("/")
def index():
    api_key = request.args.get("k")
    if api_key is None:
        api_key = ""

    listnames = []
    for i, key in enumerate(r.scan_iter(match='lists:*')):
        m = re.match(r'lists:(.*)', key)
        listname = m.group(1)
        
        listnames.append(listname)

    return render_template('index.html', listnames=listnames, api_key=api_key)


@app.route("/api/v1/items")
def get_items():
    items = []

    key = request.args.get("k")

    if key in authorized_keys:
        item_ids = get_item_ids_from_redis()
        titles = list(map(get_title_from_redis, item_ids))

        items = [{'id': item_id, 'title': title} for item_id, title in zip(item_ids, titles)]


    return json.dumps(items)


def get_item_ids_from_redis():
    return r.zrange('items', 0, -1, desc=True)


def get_title_from_redis(item_id):
    return r.get(f'items:{item_id}:title')
