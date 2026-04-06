FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
RUN apk add --no-cache git

# Clone fresco do GitHub (ignora cache local do Easypanel)
ARG CACHEBUST=1
RUN git clone --depth 1 https://github.com/AldenQuesada/clinic-dashboard.git /tmp/src

COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN cp -r /tmp/src/* /usr/share/nginx/html/ && rm -rf /tmp/src/.git /tmp/src

EXPOSE 80
