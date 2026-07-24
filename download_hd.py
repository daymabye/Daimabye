import urllib.request
import re

url = 'https://www.instagram.com/p/DZ53dOVDqb_/embed'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    urls = re.findall(r'\"(https://scontent[^\"]+\.jpg[^\"]*)\"', html)
    
    heic_urls = re.findall(r'\"(https://scontent[^\"]+\.heic\?[^\"]*dst-jpg[^\"]*)\"', html)
    urls.extend(heic_urls)
    
    if urls:
        # Find URL with largest resolution
        urls_sorted = sorted(urls, key=lambda x: ('1440' in x, '1080' in x, len(x)), reverse=True)
        raw_url = urls_sorted[0].replace('\\u0026', '&').replace('&amp;', '&')
        # Some URLs might have ' 1440w,http...' attached, split by space and take first
        img_url = raw_url.split(' ')[0]
        
        print('HD URL:', img_url)
        img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(img_req) as response, open('/root/daima-web/assets/profile_new.jpg', 'wb') as out_file:
            out_file.write(response.read())
        print('Downloaded successfully!')
    else:
        print('No scontent image found.')
except Exception as e:
    print('Error:', e)
