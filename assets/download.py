import urllib.request
import re

url = 'https://www.instagram.com/p/DZ53dOVDqb_/embed'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    # Find all scontent image urls
    urls = re.findall(r'\"(https://scontent[^\"]+\.jpg[^\"]*)\"', html)
    if urls:
        img_url = urls[0].replace('\\u0026', '&').replace('&amp;', '&')
        print('Found URL:', img_url)
        # Download the image
        img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(img_req) as response, open('DZ53dOVDqb_.jpg', 'wb') as out_file:
            out_file.write(response.read())
        print('Downloaded successfully!')
    else:
        print('No scontent image found.')
except Exception as e:
    print('Error:', e)
