#!/bin/bash

# 数据库连接配置
DB_HOST="192.168.1.18"
DB_NAME="flywave_server_geostore"
DB_USER="postgres"  # 请替换为实际用户名
DB_PASS="123456"  # 请替换为实际密码
TABLE_NAME="data_bpttatyuwjnqbj3x1xkp763rho"
  
# 导出文件名
OUTPUT_FILE="region_data.geojson"

# 定义区域坐标
POLYGON_WKT="POLYGON((117.83979148974356 36.83694978691443, 117.83979148974356 36.83151362402887, 117.86861118398667 36.83151362402887, 117.86861118398667 36.83694978691443, 117.83979148974356 36.83694978691443))"

# 设置环境变量以避免密码提示
export PGPASSWORD=$DB_PASS

# 检查是否安装了psql
if ! command -v psql &> /dev/null
then
    echo "错误: 未找到psql命令，请先安装PostgreSQL客户端"
    exit 1
fi

# 使用更简单的方法导出GeoJSON
# 先创建一个临时查询，将所有字段（除了geometry）作为properties
SQL_QUERY="SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
        (SELECT json_agg(
            json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(t.geometry)::json,
                'properties', t.properties
            )
        )
        FROM (
            SELECT * FROM $TABLE_NAME 
            WHERE ST_Intersects(geometry, ST_GeomFromText('$POLYGON_WKT', 4326))
            AND properties ? 'name'
            AND properties ->> 'name' IS NOT NULL 
            AND properties ->> 'name' != ''
        ) AS t),
        '[]'::json
    )
);"

# 如果上面的方法不工作，使用这种方法
ALT_SQL_QUERY="WITH filtered_data AS (
    SELECT * FROM $TABLE_NAME 
    WHERE ST_Intersects(geometry, ST_GeomFromText('$POLYGON_WKT', 4326))
    AND properties ? 'name'
    AND properties ->> 'name' IS NOT NULL
    AND properties ->> 'name' != ''
)
SELECT CASE 
    WHEN COUNT(*) > 0 THEN
        json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
                json_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geometry)::json,
                    'properties', filtered_data.properties
                )
            )
        )
    ELSE
        json_build_object('type', 'FeatureCollection', 'features', '[]'::json)
    END
FROM filtered_data;"

# 执行导出命令
echo "正在从数据库导出区域数据为GeoJSON格式..."

# 尝试第一种方法
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -F '' -c "$SQL_QUERY" > "$OUTPUT_FILE"

# 检查是否成功
if [ $? -eq 0 ]; then
    FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null)
    if [ $FILE_SIZE -gt 10 ]; then  # 检查是否有有效内容
        echo "数据已成功导出到 $OUTPUT_FILE"
        
        # 显示大致的记录数
        FEATURE_COUNT=$(grep -o "\"Feature\"" "$OUTPUT_FILE" | wc -l)
        echo "共导出 $FEATURE_COUNT 个地理要素"
    else
        # 如果第一种方法失败，尝试第二种方法
        echo "尝试备用方法..."
        psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -F '' -c "$ALT_SQL_QUERY" > "$OUTPUT_FILE"
        
        if [ $? -eq 0 ]; then
            FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null)
            if [ $FILE_SIZE -gt 10 ]; then
                echo "数据已成功导出到 $OUTPUT_FILE"
                FEATURE_COUNT=$(grep -o "\"Feature\"" "$OUTPUT_FILE" | wc -l)
                echo "共导出 $FEATURE_COUNT 个地理要素"
            else
                echo "导出完成，但文件为空，可能指定区域内没有数据"
            fi
        else
            echo "导出失败，请检查数据库连接参数和权限"
            exit 1
        fi
    fi
else
    echo "导出失败，请检查数据库连接参数和权限"
    exit 1
fi