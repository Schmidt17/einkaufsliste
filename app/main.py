from flask import Flask, render_template, request
import redis
import re
import os

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
    listnames = []
    for i, key in enumerate(r.scan_iter(match='lists:*')):
        m = re.match(r'lists:(.*)', key)
        listname = m.group(1)
        
        listnames.append(listname)

    return render_template('index.html', listnames=listnames)

