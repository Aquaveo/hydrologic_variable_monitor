from datetime import date
import datetime
import ee
import pandas as pd
import numpy as np
import calendar


# define functions
def get_avg_date():
    return date.today().replace(year=date.today().year - 30).strftime("%Y-%m-%d")


def get_collection(collection_name, xy_point, start_date='1992-01-01', end_date='2023-01-01'):
    return (
        ee.ImageCollection(collection_name)
        .filterBounds(xy_point)
        .filterDate(start_date, end_date)
    )


def set_ymd_properties(img):
    dates = ee.Date(img.get('system:time_start'))
    return img.set({
        'date': dates.format('YYYY-MM-DD'),
        'month_day': dates.format('MM-DD'),
        'year': dates.format('YYYY'),
        'month': dates.format('MM'),
        'day': dates.format('DD')
    })


def plot_ERA5(region, band, title, yaxis, isPoint, startDate, endDate):
    now = endDate
    y2d_start = startDate
    if startDate == "last12":
        print("check")
        y2d_start = date(date.today().year - 1, date.today().month, date.today().day).strftime("%Y-%m-%d")

    if isPoint:
        area = ee.Geometry.Point([float(region[0]), float(region[1])])
    else:
        get_coord = region["geometry"]
        area = ee.Geometry.Polygon(get_coord["coordinates"])
    # read in img col
    img_col_avg = ee.ImageCollection(
        [f'users/rachelshaylahuber55/era5_monthly_avg/era5_monthly_{i:02}' for i in range(1, 13)])

    def avg_era(img):
        return img.set('avg_value', img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=area,
        ))

    print(y2d_start)
    era_ic = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY")
    era_ytd_values_ic = era_ic.select(band).filterDate(y2d_start, now).map(avg_era)

    era_ytd_df = pd.DataFrame(
        era_ytd_values_ic.aggregate_array('avg_value').getInfo(),
        index=pd.to_datetime(np.array(era_ytd_values_ic.aggregate_array('system:time_start').getInfo()) * 1e6),
    )

    # group half hourly values by day of the year
    print(era_ytd_df)
    era_ytd_df = era_ytd_df.groupby(era_ytd_df.index.date).mean()
    print(era_ytd_df)
    avg_img = img_col_avg.select(band).map(avg_era)
    avg_df = pd.DataFrame(
        avg_img.aggregate_array('avg_value').getInfo(),
    )
    # set date and data values columns that the js code will look for
    avg_df.columns = ["data_values"]
    avg_df['datetime'] = [datetime.datetime(year=int(now[:4]), month=avg_df.index[i] + 1, day=15) for i in avg_df.index]
    avg_df.reset_index(drop=True, inplace=True)
    # set year to date values
    era_ytd_df.columns = ["data_values"]
    curr_month = 12
    print(len(era_ytd_df.index))
    test_date = datetime.datetime.strptime(y2d_start, "%Y-%m-%d")
    # initializing K
    K = len(era_ytd_df.index)
    date_generated = pd.date_range(test_date, periods=K)
    era_ytd_df['date'] = date_generated
    print(era_ytd_df)
    era_ytd_df.reset_index(drop=True, inplace=True)
    era_ytd_df['date'] = era_ytd_df['date'].dt.strftime("%Y-%m-%d")
    # precipitation must be cumulatively summer throughout the year
    if startDate == "last12":
        curr_month = int(endDate[5:7])
        for i in range(12 - curr_month):
            avg_df['datetime'][11 - i] = avg_df['datetime'][11 - i].replace(year=2021)

    avg_df.sort_values(by='datetime', inplace=True)
    avg_df.reset_index(inplace=True)
    avg_df['date'] = avg_df['datetime'].dt.strftime("%Y-%m-%d")

    if band == "total_precipitation":
        days_in_month = np.array([calendar.monthrange(int(now[:4]), i)[1] for i in range(1, 13)])
        for i in range(12 - curr_month):
            extra_val = days_in_month[11]
            days_in_month = np.delete(days_in_month, 11, 0)
            days_in_month = np.insert(days_in_month, 0, extra_val)
        avg_df['data_values'] = avg_df['data_values'].cumsum() * days_in_month * 1000

    if band == "total_precipitation":
        era_ytd_df["data_values"] = (era_ytd_df["data_values"] * 1000).cumsum()
    else:
        era_ytd_df["data_values"] = (era_ytd_df["data_values"] - 273.15)
        avg_df["data_values"] = (avg_df["data_values"] - 273.15)

    return {'avg': avg_df, 'y2d': era_ytd_df, 'title': title, 'yaxis': yaxis}


def plot_GLDAS(region, band, title, yaxis, isPoint, startDate, endDate):
    now = endDate
    y2d_start = startDate
    if startDate == "last12":
        y2d_start = date(date.today().year - 1, date.today().month, date.today().day).strftime("%Y-%m-%d")

    if isPoint == True:
        area = ee.Geometry.Point([float(region[0]), float(region[1])])
    else:
        get_coord = region["geometry"]
        area = ee.Geometry.Polygon(get_coord["coordinates"])

    gldas_ic = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H")

    def avg_gldas(img):
        return img.set('avg_value', img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=area,
        ))

    # read in assets from the gldas_monthly folder
    gldas_monthly = ee.ImageCollection(
        [f'users/rachelshaylahuber55/gldas_monthly/gldas_monthly_avg_{i:02}' for i in range(1, 13)])
    gldas_monthly = gldas_monthly.map(avg_gldas)
    gldas_avg_df = pd.DataFrame(
        gldas_monthly.aggregate_array('avg_value').getInfo(),
    )
    gldas_avg_df['datetime'] = [datetime.datetime(year=int(now[:4]), month=gldas_avg_df.index[i] + 1, day=15) for i in
                                gldas_avg_df.index]

    # precipitation must be summed
    curr_month = 12
    # precipitation must be cumulatively summer throughout the year
    if startDate == "last12":
        curr_month = int(endDate[5:7])
        for i in range(12 - curr_month):
            gldas_avg_df['datetime'][11 - i] = gldas_avg_df['datetime'][11 - i].replace(year=2021)

    gldas_avg_df.sort_values(by='datetime', inplace=True)
    gldas_avg_df.reset_index(inplace=True)
    gldas_avg_df['date'] = gldas_avg_df['datetime'].dt.strftime("%Y-%m-%d")

    if band == "Rainf_tavg":
        gldas_avg_df["data_values"] = gldas_avg_df[band]
        days_in_month = np.array([calendar.monthrange(int(now[:4]), i)[1] for i in range(1, 13)])
        for i in range(12 - curr_month):
            extra_val = days_in_month[11]
            days_in_month = np.delete(days_in_month, 11, 0)
            days_in_month = np.insert(days_in_month, 0, extra_val)
        gldas_avg_df['data_values'] = gldas_avg_df['data_values'].cumsum() * days_in_month * 86400
    else:
        gldas_avg_df["data_values"] = gldas_avg_df[band]
        gldas_avg_df['datetime'] = [datetime.datetime(year=int(now[:4]), month=gldas_avg_df.index[i] + 1, day=15)
                                    for i in gldas_avg_df.index]

    gldas_ytd = gldas_ic.select(band).filterDate(y2d_start, now).map(avg_gldas)
    gldas_ytd_df = pd.DataFrame(
        gldas_ytd.aggregate_array('avg_value').getInfo(),
        index=pd.to_datetime(np.array(gldas_ytd.aggregate_array('system:time_start').getInfo()) * 1e6)
    )
    gldas_ytd_df['date'] = gldas_ytd_df.index.strftime("%Y-%m-%d")

    if band == "Rainf_tavg":
        gldas_ytd_df["data_values"] = (gldas_ytd_df[band] * 10800).cumsum()
    else:
        gldas_ytd_df["data_values"] = gldas_ytd_df[band]
        gldas_ytd_df = gldas_ytd_df.groupby('date').mean()
        gldas_ytd_df.rename(index={0: 'index'}, inplace=True)
        gldas_ytd_df['date'] = gldas_ytd_df.index

    if band == "Tair_f_inst" or band == "AvgSurfT_inst":
        gldas_ytd_df["data_values"] = gldas_ytd_df["data_values"] - 273.15
        gldas_avg_df["data_values"] = gldas_avg_df["data_values"] - 273.15

    return {'avg': gldas_avg_df, 'y2d': gldas_ytd_df, 'title': title, 'yaxis': yaxis}


def plot_IMERG(region, isPoint, startDate, endDate):
    now = endDate
    y2d_start = startDate
    if startDate == "last12":
        y2d_start = date(date.today().year - 1, date.today().month, date.today().day).strftime("%Y-%m-%d")
    if isPoint == True:
        area = ee.Geometry.Point([float(region[0]), float(region[1])])
    else:
        get_coord = region["geometry"]
        area = ee.Geometry.Polygon(get_coord["coordinates"])

    def avg_in_bounds(img):
        return img.set('avg_value', img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=area,
        ))

    imerg_1m_ic = ee.ImageCollection(
        [f'users/rachelshaylahuber55/imerg_monthly_avg/imerg_monthly_avg_{i:02}' for i in range(1, 13)])

    imerg_1m_values_ic = imerg_1m_ic.select('HQprecipitation').map(avg_in_bounds)

    imerg_df = pd.DataFrame(
        imerg_1m_values_ic.aggregate_array('avg_value').getInfo(),
    ).dropna()
    days_in_month = np.array([calendar.monthrange(int(now[:4]), i)[1] for i in range(1, 13)])

    imerg_df['datetime'] = [datetime.datetime(year=int(now[:4]), month=imerg_df.index[i] + 1, day=15) for i in
                            imerg_df.index]
    if startDate == "last12":
        vals_array = imerg_df['HQprecipitation'].to_numpy()
        curr_month = int(endDate[5:7])
        for i in range(12 - curr_month):
            extra_val = days_in_month[11]
            days_in_month = np.delete(days_in_month, 11, 0)
            days_in_month = np.insert(days_in_month, 0, extra_val)
            imerg_df['datetime'][11 - i] = imerg_df['datetime'][11 - i].replace(year=2021)
        y2d_start = date(date.today().year - 1, date.today().month, date.today().day).strftime("%Y-%m-%d")
        imerg_df.sort_values(by='datetime', inplace=True)
        imerg_df.reset_index(inplace=True)
    imerg_df['HQprecipitation'] = imerg_df['HQprecipitation'] * 24
    imerg_df['data_values'] = imerg_df['HQprecipitation'].cumsum() * days_in_month
    imerg_df['date'] = imerg_df['datetime'].dt.strftime("%Y-%m-%d")

    imerg_30min_ic = ee.ImageCollection("NASA/GPM_L3/IMERG_V06")

    imerg_ytd_values_ic = imerg_30min_ic.select('HQprecipitation').filterDate(y2d_start, now).map(avg_in_bounds)

    imerg_ytd_df = pd.DataFrame(
        imerg_ytd_values_ic.aggregate_array('avg_value').getInfo(),
        index=pd.to_datetime(np.array(imerg_ytd_values_ic.aggregate_array('system:time_start').getInfo()) * 1e6),
    )
    # group half hourly values by day of the year
    imerg_ytd_df = imerg_ytd_df.groupby(imerg_ytd_df.index.date).mean()
    test_date = datetime.datetime.strptime(y2d_start, "%Y-%m-%d")

    # initializing K
    K = 365
    date_generated = pd.date_range(test_date, periods=K)
    # convert day-of-year to datetime, add 1 to day so it is plotted at end of day it represents
    imerg_ytd_df.index = date_generated
    imerg_ytd_df['data_values'] = imerg_ytd_df['HQprecipitation'].cumsum() * 24
    imerg_ytd_df['date'] = imerg_ytd_df.index.strftime("%Y-%m-%d")

    yaxis = "mm of precipitación"
    title = "Acumulados de Precipitación - IMERG"

    Dict = {'avg': imerg_df, 'y2d': imerg_ytd_df, 'yaxis': yaxis, 'title': title}

    return Dict


def plot_CHIRPS(region, isPoint, startDate, endDate):
    now = endDate
    y2d_start = startDate

    if isPoint == True:
        spot = ee.Geometry.Point([float(region[0]), float(region[1])])
        area = spot.buffer(400)
    else:
        get_coord = region["geometry"]
        area = ee.Geometry.Polygon(get_coord["coordinates"])
    chirps_daily_ic = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    chirps_pentad_ic = ee.ImageCollection(
        [f'users/rachelshaylahuber55/chirps_monthly_avg/chirps_monthly_avg_{i:02}' for i in range(1, 13)])

    def clip_to_bounds(img):
        return img.updateMask(ee.Image.constant(1).clip(area).mask())

    def chirps_avg(img):
        return img.set('avg_value', img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=area,
        ).get('precipitation'))

    days_in_month = np.array([calendar.monthrange(int(now[:4]), i)[1] for i in range(1, 13)])

    chirps_avg_ic = chirps_pentad_ic.select('precipitation').map(clip_to_bounds).map(
        chirps_avg)
    chirps_df = pd.DataFrame(
        chirps_avg_ic.aggregate_array('avg_value').getInfo(),

        columns=['depth', ]
    ).dropna()
    chirps_df['datetime'] = [datetime.datetime(year=int(now[:4]), month=chirps_df.index[i] + 1, day=15) for i in
                             chirps_df.index]
    if startDate == "last12":
        curr_month = int(endDate[5:7])
        for i in range(12 - curr_month):
            extra_val = days_in_month[11]
            days_in_month = np.delete(days_in_month, 11, 0)
            days_in_month = np.insert(days_in_month, 0, extra_val)
            chirps_df['datetime'][11 - i] = chirps_df['datetime'][11 - i].replace(year=2021)
        y2d_start = date(date.today().year - 1, date.today().month, date.today().day).strftime("%Y-%m-%d")
        chirps_df.sort_values(by='datetime', inplace=True)
        chirps_df.reset_index(inplace=True)

    chirps_df['data_values'] = chirps_df['depth'].cumsum() * days_in_month / 5
    chirps_df['date'] = chirps_df['datetime'].dt.strftime("%Y-%m-%d")

    chirps_ytd_ic = chirps_daily_ic.filterDate(y2d_start, now).select('precipitation').map(clip_to_bounds).map(
        chirps_avg)

    chirps_ytd_df = pd.DataFrame(
        chirps_ytd_ic.aggregate_array('avg_value').getInfo(),
        index=pd.to_datetime(np.array(chirps_ytd_ic.aggregate_array('system:time_start').getInfo()) * 1e6),
        columns=['depth', ]
    )

    chirps_ytd_df.index.name = 'datetime'
    chirps_ytd_df['data_values'] = chirps_ytd_df['depth'].cumsum()
    chirps_ytd_df['date'] = chirps_ytd_df.index.strftime("%Y-%m-%d")
    yaxis = "mm of precipitación"
    title = "Acumulados de Precipitación - CHIRPS"

    return {'avg': chirps_df, 'y2d': chirps_ytd_df, 'yaxis': yaxis, 'title': title}
