from flask import Flask, render_template, request, abort, Response
from flask_cors import CORS
import redis
import re
import os
import json
import secrets
import uuid
import paho.mqtt.client as mqtt
import ssl
from config import authorized_keys


STAGING = True
if 'DEPLOY_ENVIRONMENT' in os.environ:
    if os.environ['DEPLOY_ENVIRONMENT'] == 'production':
        STAGING = False

if STAGING:
    REDIS_NAME = 'redis-stage'
    REDIS_PORT = 6379

    url_root = 'einkaufsliste-stage'

    mqtt_topic = "einkaufsliste_doneUpdates_stage"
    mqtt_topic_newItem = "einkaufsliste_newItem_stage"
    mqtt_topic_itemDeleted = "einkaufsliste_itemDeleted_stage"
    mqtt_topic_itemUpdated = "einkaufsliste_itemUpdated_stage"
else:
    REDIS_NAME = 'redis'
    REDIS_PORT = 6379

    url_root = 'einkaufsliste'

    mqtt_topic = "einkaufsliste_doneUpdates"
    mqtt_topic_newItem = "einkaufsliste_newItem"
    mqtt_topic_itemDeleted = "einkaufsliste_itemDeleted"
    mqtt_topic_itemUpdated = "einkaufsliste_itemUpdated"


debug = False
if 'FLASK_DEBUG' in os.environ:
    debug = bool(os.environ['FLASK_DEBUG'])

app = Flask(__name__)
cors = CORS(app, resources={r"/api/*": {"origins": "*"}},
            methods=["GET", "HEAD", "POST", "UPDATE", "OPTIONS", "PUT", "PATCH", "DELETE"])


if debug:
    r = redis.Redis(host='localhost', port=f'{REDIS_PORT}', decode_responses=True)
else:
    r = redis.Redis(host=REDIS_NAME, port=f'{REDIS_PORT}', decode_responses=True)


def on_connect(client, userdata, flags, rc):
    print("Connected to MQTT broker")

def on_message(client, userdata, msg):
    print(msg.topic + " " + str(msg.payload))

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

print("Trying to connect to MQTT broker ...")
mqtt_client.tls_set(certfile=None, keyfile=None, cert_reqs=ssl.CERT_REQUIRED)
mqtt_client.connect("broker.hivemq.com", 8883, 60)
mqtt_client.loop_start()


@app.before_request
def check_authorization():
    # check if the request is authorized, return an error if not
    key = request.args.get("k")
    if key is None or not safe_isin(key, authorized_keys):
        abort(401)  # unauthorized


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

    return render_template('index.html', 
        listnames=listnames, 
        api_key=api_key, 
        url_root=url_root,
        mqtt_topic=mqtt_topic,
        mqtt_topic_newItem=mqtt_topic_newItem
    )


@app.get("/api/v1/items")
def get_items():
    # retreive the data in case of successful authorization
    item_ids = get_item_ids_from_redis()
    titles = map(get_title_from_redis, item_ids)
    item_tags = map(get_item_tags_from_redis, item_ids)
    item_tags = map(list, item_tags)
    dones = map(get_done_status_from_redis, item_ids)

    items = [{'id': item_id, 'title': title, 'tags': tags, 'done': done} 
             for item_id, title, tags, done in zip(item_ids, titles, item_tags, dones)]

    return json.dumps(items)


@app.post("/api/v1/items")
def post_item():
    new_id = add_item(request.json['itemData'])

    return {'success': True, 'newId': new_id}


@app.route("/api/v1/items/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    delete_item_from_redis(item_id)

    publish_item_deleted(item_id)

    return {'success': True}


@app.get("/api/v1/tags")
def get_tags():
    tags = get_all_tags_from_redis()
    return {'tags': list(tags)}


@app.route("/api/v1/items/<item_id>", methods=['UPDATE'])
def update_item(item_id):
    new_item_data = update_item_in_redis(item_id, request.json['itemData'])

    publish_item_updated(new_item_data['id'], new_item_data['title'], new_item_data['tags'], new_item_data['done'])

    return {'success': True}


@app.route("/api/v1/items/<item_id>/done", methods=['GET', 'UPDATE'])
def done_status(item_id):
    if request.method == 'GET':
        status = get_done_status_from_redis(item_id)
        if status:
            done = 1
        else:
            done = 0

        return {'done': done}
    else:
        add_done_status_to_redis(item_id, request.json['done'])

        return {'success': True}


def get_all_tags_from_redis():
    all_tags = r.smembers('tags')

    if all_tags is None:
        return set()
    else:
        return all_tags


def delete_item_from_redis(item_id):
    # delete entry from items sorted set
    r.zrem('items', item_id)

    # delete title
    r.delete(f'items:{item_id}:title')

    # delete tags
    r.delete(f'items:{item_id}:tags')
    # update the global tags set
    update_tags_set_in_redis()


def update_tags_set_in_redis():
    # get all item IDs
    item_ids = get_item_ids_from_redis()
    # construct all tag keys from the item ids
    tag_keys = [f'items:{item_id}:tags' for item_id in item_ids]

    if len(tag_keys) > 0:
        # store the union of all tag sets in the global tag set
        r.sunionstore('tags', *tag_keys)
    else:
        r.delete('tags')


def update_item_in_redis(item_id, item_data):

    new_item_data = {
        'id': item_id,
        'title': item_data['title'],
        'tags': item_data['tags'],
        'done': 0
    }

    # update title
    add_title_to_redis(item_id, new_item_data['title'])

    # update tags
    # delete old tags
    r.delete(f'items:{item_id}:tags')
    # update the global tags set in case some tags vanished
    update_tags_set_in_redis()
    # add in the new tags
    add_tags_to_redis(item_id, new_item_data['tags'])

    # set done to false
    add_done_status_to_redis(item_id, new_item_data['done'])

    return new_item_data


def add_item(item_data):
    # create new ID
    new_id = str(uuid.uuid4())

    # add ID to item ordered set
    # find current highest score
    high_id, high_score = get_highscore_item_from_redis()
    # increment score (if any) and add item
    if high_score is None:
        new_score = 0
    else:
        new_score = high_score + 1
    add_item_to_redis(new_id, new_score)

    # add title
    add_title_to_redis(new_id, item_data['title'])

    # add tags
    add_tags_to_redis(new_id, item_data['tags'])

    # set done status to false
    add_done_status_to_redis(new_id, 0)

    # publish to clients that a new item was added
    publish_new_item(new_id, item_data['title'], item_data['tags'], 0)

    return new_id


def get_item_ids_from_redis():
    return r.zrange('items', 0, -1)


def get_highscore_item_from_redis():
    items = r.zrange('items', 0, 0, desc=True, withscores=True)

    if items:
        return items[0]
    else:
        return None, None


def add_item_to_redis(item_id, score):
    r.zadd('items', {item_id: score})


def add_title_to_redis(item_id, title):
    r.set(f'items:{item_id}:title', title)


def publish_new_item(item_id, title, tags, done):
    mqtt_client.publish(mqtt_topic_newItem, json.dumps({'id': item_id, 'title': title, 'tags': tags, 'done': done}), qos=1, retain=False)


def publish_item_updated(item_id, title, tags, done):
    mqtt_client.publish(mqtt_topic_itemUpdated, json.dumps({'id': item_id, 'title': title, 'tags': tags, 'done': done}), qos=1, retain=False)


def publish_done_status(item_id, status):
    mqtt_client.publish(mqtt_topic, json.dumps({'id': item_id, 'status': status}), qos=1, retain=False)


def publish_item_deleted(item_id):
    mqtt_client.publish(mqtt_topic_itemDeleted, json.dumps({'id': item_id}), qos=1, retain=False)


def add_done_status_to_redis(item_id, status):
    int_status = int(status)
    
    r.set(f'items:{item_id}:done', str(int_status))
    publish_done_status(item_id, status)


def get_done_status_from_redis(item_id):
    return int(r.get(f'items:{item_id}:done'))


def add_tags_to_redis(item_id, tags):
    for tag in tags:
        r.sadd('tags', tag)  # add to global tag set
        r.sadd(f'items:{item_id}:tags', tag)  # add to item tag set


def get_title_from_redis(item_id):
    return r.get(f'items:{item_id}:title')


def get_item_tags_from_redis(item_id):
    return r.smembers(f'items:{item_id}:tags')


def safe_isin(x, collection):
    for elt in collection:
        if secrets.compare_digest(x, elt):
            return True

    return False
