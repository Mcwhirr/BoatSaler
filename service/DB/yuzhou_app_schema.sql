-- =========================
-- 0. 字典/枚举
-- =========================

CREATE TABLE IF NOT EXISTS dict_region (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code        VARCHAR(8) NOT NULL DEFAULT 'CN',
    province            VARCHAR(64),
    city                VARCHAR(64),
    district            VARCHAR(64),
    address_detail      VARCHAR(255),
    latitude            NUMERIC(10,7),
    longitude           NUMERIC(10,7),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE dict_region IS '通用地区/LBS地址表';

CREATE TABLE IF NOT EXISTS dict_tag (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_type            VARCHAR(32) NOT NULL, -- boat/activity/course/customer等
    tag_name            VARCHAR(64) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tag_type, tag_name)
);
COMMENT ON TABLE dict_tag IS '标签字典（客户标签、船艇标签、活动标签等）';

-- =========================
-- 1. 账号与组织主体
-- =========================

CREATE TABLE IF NOT EXISTS app_user (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone               VARCHAR(32) UNIQUE,
    email               VARCHAR(128) UNIQUE,
    password_hash       VARCHAR(255),
    nickname            VARCHAR(64),
    avatar_url          TEXT,
    status              VARCHAR(16) NOT NULL DEFAULT 'active', -- active/disabled
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
COMMENT ON TABLE app_user IS '统一用户账号（手机号/邮箱登录）';

CREATE TABLE IF NOT EXISTS user_oauth_account (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    provider            VARCHAR(32) NOT NULL, -- wechat/apple/google...
    provider_uid        VARCHAR(128) NOT NULL,
    union_id            VARCHAR(128),
    extra_info          JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_uid)
);
COMMENT ON TABLE user_oauth_account IS '第三方登录绑定账号';

CREATE TABLE IF NOT EXISTS user_realname_verification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    real_name           VARCHAR(64) NOT NULL,
    id_no_masked        VARCHAR(64) NOT NULL,
    verify_status       VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending/approved/rejected
    verify_time         TIMESTAMPTZ,
    reviewer_id         UUID REFERENCES app_user(id),
    remark              VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_realname_verification IS '实名认证';

CREATE TABLE IF NOT EXISTS merchant (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name       VARCHAR(128) NOT NULL,
    merchant_type       VARCHAR(32) NOT NULL, -- dealer/service/training/club
    contact_name        VARCHAR(64),
    contact_phone       VARCHAR(32),
    status              VARCHAR(16) NOT NULL DEFAULT 'active',
    description         TEXT,
    region_id           UUID REFERENCES dict_region(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE merchant IS '商家主体（销售商/服务商/培训机构等）';

CREATE TABLE IF NOT EXISTS merchant_staff (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    staff_role          VARCHAR(32) NOT NULL, -- sales/technician/trainer/ops
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, user_id, staff_role)
);
COMMENT ON TABLE merchant_staff IS '商家端人员（含销售人员）';

CREATE TABLE IF NOT EXISTS broker_profile (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    license_no          VARCHAR(128),
    certifications      JSONB, -- 航海证书/技术认证/讲师资质
    service_cases       JSONB,
    verify_status       VARCHAR(16) NOT NULL DEFAULT 'pending',
    verified_at         TIMESTAMPTZ,
    rating_avg          NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    completed_deals     INT NOT NULL DEFAULT 0,
    intro               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE broker_profile IS '独立经纪人档案';

CREATE TABLE IF NOT EXISTS app_role_assignment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role_code           VARCHAR(32) NOT NULL, -- user/member/boat_owner/sales/broker/merchant_admin
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role_code)
);
COMMENT ON TABLE app_role_assignment IS '统一角色分配（四端权限基础）';

-- =========================
-- 2. 船艇与关联能力
-- =========================

CREATE TABLE IF NOT EXISTS boat_brand (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_name          VARCHAR(64) NOT NULL UNIQUE,
    country_code        VARCHAR(8),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE boat_brand IS '船艇品牌';

CREATE TABLE IF NOT EXISTS boat_model (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id            UUID NOT NULL REFERENCES boat_brand(id) ON DELETE RESTRICT,
    model_name          VARCHAR(128) NOT NULL,
    boat_type           VARCHAR(32) NOT NULL, -- 动力艇/帆船/游艇/钓鱼艇
    length_meter        NUMERIC(6,2),
    capacity            INT,
    engine_type         VARCHAR(64),
    draft_meter         NUMERIC(5,2),
    year_released       INT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_id, model_name)
);
COMMENT ON TABLE boat_model IS '船艇型号';

CREATE TABLE IF NOT EXISTS boat_listing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchant(id),
    model_id            UUID NOT NULL REFERENCES boat_model(id),
    listing_code        VARCHAR(64) NOT NULL UNIQUE,
    title               VARCHAR(255) NOT NULL,
    listing_type        VARCHAR(16) NOT NULL, -- sale/rent/both
    price_sale          NUMERIC(14,2),
    price_day           NUMERIC(12,2),
    price_week          NUMERIC(12,2),
    price_month         NUMERIC(12,2),
    year_built          INT,
    condition_level     VARCHAR(32),
    has_captain_option  BOOLEAN NOT NULL DEFAULT TRUE,
    supports_beginner   BOOLEAN NOT NULL DEFAULT FALSE,
    inventory_status    VARCHAR(16) NOT NULL DEFAULT 'in_stock', -- in_stock/sold/rented/offline
    region_id           UUID REFERENCES dict_region(id),
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE boat_listing IS '商家船艇上架信息（销售+租赁）';

CREATE TABLE IF NOT EXISTS boat_media (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boat_listing_id     UUID NOT NULL REFERENCES boat_listing(id) ON DELETE CASCADE,
    media_type          VARCHAR(16) NOT NULL, -- image/video/vr360
    media_url           TEXT NOT NULL,
    sort_no             INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE boat_media IS '船艇图/视频/VR素材';

CREATE TABLE IF NOT EXISTS boat_tag_relation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boat_listing_id     UUID NOT NULL REFERENCES boat_listing(id) ON DELETE CASCADE,
    tag_id              UUID NOT NULL REFERENCES dict_tag(id) ON DELETE CASCADE,
    UNIQUE (boat_listing_id, tag_id)
);
COMMENT ON TABLE boat_tag_relation IS '船艇标签关联';

CREATE TABLE IF NOT EXISTS boat_compare_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    boat_listing_ids    UUID[] NOT NULL, -- 2-3个ID
    compare_snapshot    JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE boat_compare_log IS '船艇对比记录';

CREATE TABLE IF NOT EXISTS user_favorite (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    favorite_type       VARCHAR(32) NOT NULL, -- boat/rent/upgrade/course/activity/article/product
    target_id           UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, favorite_type, target_id)
);
COMMENT ON TABLE user_favorite IS '我的收藏';

CREATE TABLE IF NOT EXISTS user_footprint (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    footprint_type      VARCHAR(32) NOT NULL,
    target_id           UUID NOT NULL,
    viewed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_footprint IS '我的足迹';

-- =========================
-- 3. 智能升级模块
-- =========================

CREATE TABLE IF NOT EXISTS upgrade_solution (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchant(id),
    solution_name       VARCHAR(128) NOT NULL,
    upgrade_type        VARCHAR(32) NOT NULL, -- 导航/自动驾驶/远程监控/能耗优化/娱乐
    version_no          VARCHAR(32),
    price               NUMERIC(12,2) NOT NULL,
    installment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    install_flow        TEXT,
    params_json         JSONB,
    effect_desc         TEXT,
    beginner_friendly   BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE upgrade_solution IS '智能升级方案';

CREATE TABLE IF NOT EXISTS upgrade_solution_compatibility (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id         UUID NOT NULL REFERENCES upgrade_solution(id) ON DELETE CASCADE,
    model_id            UUID NOT NULL REFERENCES boat_model(id) ON DELETE CASCADE,
    compatibility_level VARCHAR(16) NOT NULL DEFAULT 'full', -- full/partial/custom
    note                VARCHAR(255),
    UNIQUE (solution_id, model_id)
);
COMMENT ON TABLE upgrade_solution_compatibility IS '升级方案与船型兼容关系';

CREATE TABLE IF NOT EXISTS service_point (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
    point_name          VARCHAR(128) NOT NULL,
    service_type        VARCHAR(32) NOT NULL, -- upgrade/maintenance/training
    region_id           UUID REFERENCES dict_region(id),
    contact_phone       VARCHAR(32),
    open_hours          VARCHAR(128),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE service_point IS '服务网点（升级/维修/培训）';

-- =========================
-- 4. 新手课堂
-- =========================

CREATE TABLE IF NOT EXISTS course (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID REFERENCES merchant(id),
    course_title        VARCHAR(255) NOT NULL,
    stage_level         VARCHAR(16) NOT NULL, -- 入门/进阶/高阶
    module_type         VARCHAR(32) NOT NULL, -- 基础/操作/安全/智能系统/礼仪
    boat_type           VARCHAR(32),
    course_form         VARCHAR(16) NOT NULL, -- video/live/offline
    duration_min        INT,
    syllabus            TEXT,
    lecturer_profile    TEXT,
    price               NUMERIC(12,2) NOT NULL DEFAULT 0,
    status              VARCHAR(16) NOT NULL DEFAULT 'online',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE course IS '新手课堂课程';

CREATE TABLE IF NOT EXISTS course_lesson (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    lesson_no           INT NOT NULL,
    lesson_title        VARCHAR(255) NOT NULL,
    content_type        VARCHAR(16) NOT NULL, -- video/live/offline/quiz
    content_url         TEXT,
    planned_start_at    TIMESTAMPTZ,
    duration_min        INT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, lesson_no)
);
COMMENT ON TABLE course_lesson IS '课程章节';

CREATE TABLE IF NOT EXISTS course_enrollment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    course_id           UUID NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    enrollment_status   VARCHAR(16) NOT NULL DEFAULT 'active',
    progress_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
    learned_minutes     INT NOT NULL DEFAULT 0,
    certificate_status  VARCHAR(16) NOT NULL DEFAULT 'none', -- none/passed/issued
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, course_id)
);
COMMENT ON TABLE course_enrollment IS '课程报名与学习进度';

CREATE TABLE IF NOT EXISTS course_progress (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id       UUID NOT NULL REFERENCES course_enrollment(id) ON DELETE CASCADE,
    lesson_id           UUID NOT NULL REFERENCES course_lesson(id) ON DELETE CASCADE,
    progress_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
    watched_seconds     INT NOT NULL DEFAULT 0,
    last_learned_at     TIMESTAMPTZ,
    UNIQUE (enrollment_id, lesson_id)
);
COMMENT ON TABLE course_progress IS '章节级学习进度';

CREATE TABLE IF NOT EXISTS certificate (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    course_id           UUID NOT NULL REFERENCES course(id),
    cert_no             VARCHAR(64) NOT NULL UNIQUE,
    cert_name           VARCHAR(128) NOT NULL,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until         TIMESTAMPTZ
);
COMMENT ON TABLE certificate IS '电子证书';

-- =========================
-- 5. 商家付费活动
-- =========================

CREATE TABLE IF NOT EXISTS merchant_activity (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
    activity_name       VARCHAR(255) NOT NULL,
    activity_type       VARCHAR(32) NOT NULL, -- 试航/升级特惠/训练营/讲座/俱乐部
    region_id           UUID REFERENCES dict_region(id),
    start_at            TIMESTAMPTZ NOT NULL,
    end_at              TIMESTAMPTZ NOT NULL,
    fee                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    seat_total          INT NOT NULL,
    seat_left           INT NOT NULL,
    requires_course     BOOLEAN NOT NULL DEFAULT FALSE,
    required_course_id  UUID REFERENCES course(id),
    status              VARCHAR(16) NOT NULL DEFAULT 'published',
    detail              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (seat_left >= 0),
    CHECK (end_at > start_at)
);
COMMENT ON TABLE merchant_activity IS '商家活动（含付费）';

CREATE TABLE IF NOT EXISTS activity_media (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id         UUID NOT NULL REFERENCES merchant_activity(id) ON DELETE CASCADE,
    media_type          VARCHAR(16) NOT NULL,
    media_url           TEXT NOT NULL,
    sort_no             INT NOT NULL DEFAULT 0
);
COMMENT ON TABLE activity_media IS '活动图文视频素材';

CREATE TABLE IF NOT EXISTS activity_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id         UUID NOT NULL REFERENCES merchant_activity(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    participant_count   INT NOT NULL DEFAULT 1,
    pay_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    voucher_code        VARCHAR(64),
    checkin_status      VARCHAR(16) NOT NULL DEFAULT 'not_checked',
    registration_status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending/paid/cancelled/completed
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (activity_id, user_id)
);
COMMENT ON TABLE activity_registration IS '活动报名与签到凭证';

CREATE TABLE IF NOT EXISTS activity_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id         UUID NOT NULL REFERENCES merchant_activity(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    score               INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    content             TEXT,
    media_urls          JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (activity_id, user_id)
);
COMMENT ON TABLE activity_feedback IS '活动反馈/口碑';

-- =========================
-- 6. 商品与周边
-- =========================

CREATE TABLE IF NOT EXISTS product_category (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name       VARCHAR(64) NOT NULL UNIQUE,
    parent_id           UUID REFERENCES product_category(id)
);
COMMENT ON TABLE product_category IS '商品分类（配件/仪器/安全设备/培训装备/活动周边）';

CREATE TABLE IF NOT EXISTS product (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
    category_id         UUID NOT NULL REFERENCES product_category(id),
    product_name        VARCHAR(255) NOT NULL,
    sku_code            VARCHAR(64) NOT NULL UNIQUE,
    price               NUMERIC(12,2) NOT NULL,
    stock_qty           INT NOT NULL DEFAULT 0,
    compatible_models   JSONB,
    compatible_upgrade  JSONB,
    beginner_friendly   BOOLEAN NOT NULL DEFAULT FALSE,
    activity_related    BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(16) NOT NULL DEFAULT 'active',
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE product IS '周边/配件商品';

CREATE TABLE IF NOT EXISTS product_media (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    media_type          VARCHAR(16) NOT NULL,
    media_url           TEXT NOT NULL,
    sort_no             INT NOT NULL DEFAULT 0
);
COMMENT ON TABLE product_media IS '商品图文素材';

CREATE TABLE IF NOT EXISTS shopping_cart_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    item_type           VARCHAR(32) NOT NULL, -- product/upgrade/course/activity
    target_id           UUID NOT NULL,
    quantity            INT NOT NULL DEFAULT 1,
    extra_info          JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, item_type, target_id)
);
COMMENT ON TABLE shopping_cart_item IS '购物车';

-- =========================
-- 7. 交易订单体系（统一母单 + 子单）
-- =========================

CREATE TABLE IF NOT EXISTS trade_order (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no            VARCHAR(64) NOT NULL UNIQUE,
    user_id             UUID NOT NULL REFERENCES app_user(id),
    merchant_id         UUID REFERENCES merchant(id),
    sales_user_id       UUID REFERENCES app_user(id), -- 销售跟单
    broker_user_id      UUID REFERENCES app_user(id), -- 经纪人
    order_type          VARCHAR(32) NOT NULL, -- boat_purchase/rent/upgrade/course/activity/product/maintenance/package
    order_status        VARCHAR(16) NOT NULL DEFAULT 'pending',
    total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    payable_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    installment_plan    JSONB,
    package_info        JSONB, -- 新手套餐/活动特惠套餐
    signed_contract_id  UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at             TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ
);
COMMENT ON TABLE trade_order IS '统一订单主表';

CREATE TABLE IF NOT EXISTS trade_order_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES trade_order(id) ON DELETE CASCADE,
    item_type           VARCHAR(32) NOT NULL, -- boat/product/upgrade/course/activity/service
    target_id           UUID NOT NULL,
    item_title          VARCHAR(255) NOT NULL,
    unit_price          NUMERIC(14,2) NOT NULL,
    quantity            INT NOT NULL DEFAULT 1,
    amount              NUMERIC(14,2) NOT NULL,
    extra_snapshot      JSONB
);
COMMENT ON TABLE trade_order_item IS '统一订单明细';

CREATE TABLE IF NOT EXISTS payment_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES trade_order(id) ON DELETE CASCADE,
    payment_no          VARCHAR(64) NOT NULL UNIQUE,
    channel             VARCHAR(32) NOT NULL, -- wechat/alipay/applepay/bank
    pay_amount          NUMERIC(14,2) NOT NULL,
    pay_status          VARCHAR(16) NOT NULL DEFAULT 'pending',
    paid_at             TIMESTAMPTZ,
    channel_txn_no      VARCHAR(128),
    raw_payload         JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE payment_record IS '支付记录';

CREATE TABLE IF NOT EXISTS refund_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES trade_order(id) ON DELETE CASCADE,
    refund_no           VARCHAR(64) NOT NULL UNIQUE,
    refund_amount       NUMERIC(14,2) NOT NULL,
    refund_reason       VARCHAR(255),
    refund_status       VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    refunded_at         TIMESTAMPTZ
);
COMMENT ON TABLE refund_record IS '退款记录';

CREATE TABLE IF NOT EXISTS e_contract (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_no         VARCHAR(64) NOT NULL UNIQUE,
    contract_type       VARCHAR(32) NOT NULL, -- purchase/upgrade/training/activity
    order_id            UUID REFERENCES trade_order(id),
    user_id             UUID NOT NULL REFERENCES app_user(id),
    merchant_id         UUID REFERENCES merchant(id),
    file_url            TEXT NOT NULL,
    sign_status         VARCHAR(16) NOT NULL DEFAULT 'pending',
    signed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE e_contract IS '电子合同';

ALTER TABLE trade_order
    ADD CONSTRAINT fk_trade_order_contract
    FOREIGN KEY (signed_contract_id) REFERENCES e_contract(id);

-- =========================
-- 8. 船艇购买/预约看船/咨询
-- =========================

CREATE TABLE IF NOT EXISTS consultation_session (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    sales_user_id       UUID REFERENCES app_user(id),
    broker_user_id      UUID REFERENCES app_user(id),
    topic_type          VARCHAR(32) NOT NULL, -- boat/upgrade/course/activity
    related_target_id   UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE consultation_session IS '在线咨询会话';

CREATE TABLE IF NOT EXISTS consultation_message (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES consultation_session(id) ON DELETE CASCADE,
    sender_user_id      UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    msg_type            VARCHAR(16) NOT NULL, -- text/image/link/card
    msg_body            TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE consultation_message IS '咨询消息';

CREATE TABLE IF NOT EXISTS boat_view_appointment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    boat_listing_id     UUID NOT NULL REFERENCES boat_listing(id),
    sales_user_id       UUID REFERENCES app_user(id),
    broker_user_id      UUID REFERENCES app_user(id),
    appointment_time    TIMESTAMPTZ NOT NULL,
    appointment_region  UUID REFERENCES dict_region(id),
    with_course_trial   BOOLEAN NOT NULL DEFAULT FALSE,
    with_activity_trial BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(16) NOT NULL DEFAULT 'pending',
    feedback            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE boat_view_appointment IS '预约看船';

CREATE TABLE IF NOT EXISTS boat_purchase_order_ext (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL UNIQUE REFERENCES trade_order(id) ON DELETE CASCADE,
    boat_listing_id     UUID NOT NULL REFERENCES boat_listing(id),
    down_payment        NUMERIC(14,2),
    full_payment        NUMERIC(14,2),
    delivery_status     VARCHAR(16) NOT NULL DEFAULT 'pending',
    logistics_info      JSONB,
    beginner_package    BOOLEAN NOT NULL DEFAULT FALSE,
    promo_package       BOOLEAN NOT NULL DEFAULT FALSE
);
COMMENT ON TABLE boat_purchase_order_ext IS '购船订单扩展';

-- =========================
-- 9. 租赁与保险
-- =========================

CREATE TABLE IF NOT EXISTS rental_schedule (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boat_listing_id     UUID NOT NULL REFERENCES boat_listing(id) ON DELETE CASCADE,
    start_at            TIMESTAMPTZ NOT NULL,
    end_at              TIMESTAMPTZ NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'available', -- available/booked/blocked
    note                VARCHAR(255),
    CHECK (end_at > start_at)
);
COMMENT ON TABLE rental_schedule IS '租赁档期';

CREATE TABLE IF NOT EXISTS rental_order_ext (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL UNIQUE REFERENCES trade_order(id) ON DELETE CASCADE,
    boat_listing_id     UUID NOT NULL REFERENCES boat_listing(id),
    rent_mode           VARCHAR(16) NOT NULL, -- day/week/month
    start_at            TIMESTAMPTZ NOT NULL,
    end_at              TIMESTAMPTZ NOT NULL,
    with_captain        BOOLEAN NOT NULL DEFAULT FALSE,
    usage_requirements  JSONB,
    deposit_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    deposit_status      VARCHAR(16) NOT NULL DEFAULT 'frozen', -- frozen/refunding/refunded
    beginner_eval_score NUMERIC(5,2),
    nav_track_url       TEXT,
    fuel_data           JSONB
);
COMMENT ON TABLE rental_order_ext IS '租赁订单扩展';

CREATE TABLE IF NOT EXISTS rental_insurance_policy (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_order_id     UUID NOT NULL REFERENCES rental_order_ext(id) ON DELETE CASCADE,
    policy_no           VARCHAR(64) NOT NULL UNIQUE,
    coverage_items      JSONB NOT NULL, -- 故障/新手失误/活动损失
    premium_amount      NUMERIC(12,2) NOT NULL,
    insured_amount      NUMERIC(14,2) NOT NULL,
    policy_status       VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE rental_insurance_policy IS '租赁保险';

CREATE TABLE IF NOT EXISTS rental_review (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_order_id     UUID NOT NULL UNIQUE REFERENCES rental_order_ext(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    boat_score          INT CHECK (boat_score BETWEEN 1 AND 5),
    captain_score       INT CHECK (captain_score BETWEEN 1 AND 5),
    smart_system_score  INT CHECK (smart_system_score BETWEEN 1 AND 5),
    training_score      INT CHECK (training_score BETWEEN 1 AND 5),
    activity_score      INT CHECK (activity_score BETWEEN 1 AND 5),
    review_content      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE rental_review IS '租赁评价';

-- =========================
-- 10. 升级订单与服务
-- =========================

CREATE TABLE IF NOT EXISTS upgrade_order_ext (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL UNIQUE REFERENCES trade_order(id) ON DELETE CASCADE,
    solution_id         UUID NOT NULL REFERENCES upgrade_solution(id),
    boat_listing_id     UUID REFERENCES boat_listing(id),
    service_point_id    UUID REFERENCES service_point(id),
    install_mode        VARCHAR(16) NOT NULL DEFAULT 'onsite', -- onsite/home
    install_time        TIMESTAMPTZ,
    install_status      VARCHAR(16) NOT NULL DEFAULT 'pending',
    installer_user_id   UUID REFERENCES app_user(id),
    expected_finish_at  TIMESTAMPTZ,
    warranty_months     INT NOT NULL DEFAULT 24
);
COMMENT ON TABLE upgrade_order_ext IS '升级订单扩展';

CREATE TABLE IF NOT EXISTS upgrade_service_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upgrade_order_id    UUID NOT NULL REFERENCES upgrade_order_ext(id) ON DELETE CASCADE,
    log_type            VARCHAR(32) NOT NULL, -- 接单/安装/调试/故障
    log_content         TEXT NOT NULL,
    created_by          UUID REFERENCES app_user(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE upgrade_service_log IS '升级进度日志';

-- =========================
-- 11. 会员体系 / 成长值 / 分红 / 提现
-- =========================

CREATE TABLE IF NOT EXISTS membership_level (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_code          VARCHAR(16) NOT NULL UNIQUE, -- normal/silver/gold/diamond
    level_name          VARCHAR(32) NOT NULL,
    min_growth_value    INT NOT NULL,
    benefit_desc        TEXT
);
COMMENT ON TABLE membership_level IS '会员等级规则';

CREATE TABLE IF NOT EXISTS user_membership (
    user_id             UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    level_id            UUID NOT NULL REFERENCES membership_level(id),
    growth_value        INT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_membership IS '用户会员状态';

CREATE TABLE IF NOT EXISTS growth_task (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_code           VARCHAR(32) NOT NULL UNIQUE, -- signin/profile/share/qa/course/activity
    task_name           VARCHAR(128) NOT NULL,
    growth_value        INT NOT NULL,
    daily_limit         INT
);
COMMENT ON TABLE growth_task IS '成长值任务配置';

CREATE TABLE IF NOT EXISTS growth_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    task_id             UUID REFERENCES growth_task(id),
    source_type         VARCHAR(32) NOT NULL,
    source_id           UUID,
    growth_delta        INT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE growth_log IS '成长值流水';

CREATE TABLE IF NOT EXISTS wallet_account (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type          VARCHAR(16) NOT NULL, -- user/sales/broker/merchant
    owner_user_id       UUID REFERENCES app_user(id),
    owner_merchant_id   UUID REFERENCES merchant(id),
    balance             NUMERIC(14,2) NOT NULL DEFAULT 0,
    frozen_balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_type, owner_user_id, owner_merchant_id)
);
COMMENT ON TABLE wallet_account IS '钱包账户（用于分红/提现）';

CREATE TABLE IF NOT EXISTS bonus_pool_monthly (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bonus_month         DATE NOT NULL UNIQUE,
    platform_profit     NUMERIC(16,2) NOT NULL,
    pool_ratio          NUMERIC(5,4) NOT NULL,
    pool_amount         NUMERIC(16,2) NOT NULL,
    settled_at          TIMESTAMPTZ
);
COMMENT ON TABLE bonus_pool_monthly IS '会员分红池（月）';

CREATE TABLE IF NOT EXISTS bonus_settlement (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bonus_pool_id       UUID NOT NULL REFERENCES bonus_pool_monthly(id) ON DELETE CASCADE,
    beneficiary_type    VARCHAR(16) NOT NULL, -- member/sales/broker
    beneficiary_user_id UUID NOT NULL REFERENCES app_user(id),
    related_order_id    UUID REFERENCES trade_order(id),
    bonus_ratio         NUMERIC(7,4) NOT NULL,
    bonus_amount        NUMERIC(14,2) NOT NULL,
    settle_status       VARCHAR(16) NOT NULL DEFAULT 'pending',
    settle_at           TIMESTAMPTZ
);
COMMENT ON TABLE bonus_settlement IS '分红结算明细（含销售/经纪人扩展规则）';

CREATE TABLE IF NOT EXISTS bank_account (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    bank_name           VARCHAR(128) NOT NULL,
    account_no_masked   VARCHAR(64) NOT NULL,
    account_holder      VARCHAR(64) NOT NULL,
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE bank_account IS '提现银行卡';

CREATE TABLE IF NOT EXISTS withdraw_request (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id           UUID NOT NULL REFERENCES wallet_account(id) ON DELETE CASCADE,
    bank_account_id     UUID REFERENCES bank_account(id),
    amount              NUMERIC(14,2) NOT NULL,
    arrival_type        VARCHAR(16) NOT NULL, -- realtime/nextday
    request_status      VARCHAR(16) NOT NULL DEFAULT 'pending',
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at         TIMESTAMPTZ
);
COMMENT ON TABLE withdraw_request IS '提现申请';

-- =========================
-- 12. 售后、维修保养、船艇档案
-- =========================

CREATE TABLE IF NOT EXISTS user_boat_asset (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    boat_listing_id     UUID REFERENCES boat_listing(id),
    model_id            UUID REFERENCES boat_model(id),
    hull_no             VARCHAR(64),
    purchased_order_id  UUID REFERENCES trade_order(id),
    acquired_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_boat_asset IS '我的船艇资产';

CREATE TABLE IF NOT EXISTS maintenance_plan (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchant(id),
    plan_name           VARCHAR(128) NOT NULL,
    plan_desc           TEXT,
    price               NUMERIC(12,2) NOT NULL,
    includes_upgrade_check BOOLEAN NOT NULL DEFAULT TRUE,
    includes_training_guidance BOOLEAN NOT NULL DEFAULT FALSE,
    active_status       VARCHAR(16) NOT NULL DEFAULT 'active'
);
COMMENT ON TABLE maintenance_plan IS '保养套餐';

CREATE TABLE IF NOT EXISTS maintenance_order_ext (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL UNIQUE REFERENCES trade_order(id) ON DELETE CASCADE,
    user_boat_asset_id  UUID NOT NULL REFERENCES user_boat_asset(id),
    service_type        VARCHAR(32) NOT NULL, -- 保养/维修/调试
    service_point_id    UUID REFERENCES service_point(id),
    appoint_time        TIMESTAMPTZ,
    service_status      VARCHAR(16) NOT NULL DEFAULT 'pending',
    report_json         JSONB
);
COMMENT ON TABLE maintenance_order_ext IS '维修保养订单扩展';

CREATE TABLE IF NOT EXISTS warranty_claim (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    user_boat_asset_id  UUID REFERENCES user_boat_asset(id),
    issue_type          VARCHAR(32) NOT NULL, -- engine/smart_system/others
    issue_desc          TEXT NOT NULL,
    media_urls          JSONB,
    operation_question  TEXT, -- 新手操作疑问
    activity_related    BOOLEAN NOT NULL DEFAULT FALSE,
    claim_status        VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE warranty_claim IS '保修申请';

CREATE TABLE IF NOT EXISTS service_evaluation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id),
    order_id            UUID REFERENCES trade_order(id),
    score_efficiency    INT CHECK (score_efficiency BETWEEN 1 AND 5),
    score_quality       INT CHECK (score_quality BETWEEN 1 AND 5),
    score_smart_tuning  INT CHECK (score_smart_tuning BETWEEN 1 AND 5),
    score_guidance      INT CHECK (score_guidance BETWEEN 1 AND 5),
    score_activity_srv  INT CHECK (score_activity_srv BETWEEN 1 AND 5),
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE service_evaluation IS '售后服务评价';

CREATE TABLE IF NOT EXISTS maintenance_reminder (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_boat_asset_id  UUID NOT NULL REFERENCES user_boat_asset(id) ON DELETE CASCADE,
    remind_type         VARCHAR(32) NOT NULL, -- hour/month/quarter/sensor/review/activity_coupon
    remind_at           TIMESTAMPTZ NOT NULL,
    remind_status       VARCHAR(16) NOT NULL DEFAULT 'pending',
    content             VARCHAR(255)
);
COMMENT ON TABLE maintenance_reminder IS '保养提醒';

-- =========================
-- 13. 社区与资讯
-- =========================

CREATE TABLE IF NOT EXISTS article (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID REFERENCES merchant(id),
    author_user_id      UUID REFERENCES app_user(id),
    article_type        VARCHAR(32) NOT NULL, -- 资讯/技巧/教程/活动预告
    title               VARCHAR(255) NOT NULL,
    summary             TEXT,
    content             TEXT NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'published',
    published_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE article IS '资讯文章';

CREATE TABLE IF NOT EXISTS community_post (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    post_type           VARCHAR(32) NOT NULL, -- experience/qa/show/activity
    title               VARCHAR(255),
    content             TEXT NOT NULL,
    related_activity_id UUID REFERENCES merchant_activity(id),
    media_urls          JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE community_post IS '社区帖子';

CREATE TABLE IF NOT EXISTS community_comment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id             UUID NOT NULL REFERENCES community_post(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    parent_comment_id   UUID REFERENCES community_comment(id),
    content             TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE community_comment IS '社区评论';

CREATE TABLE IF NOT EXISTS community_like (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    target_type         VARCHAR(16) NOT NULL, -- post/comment
    target_id           UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, target_type, target_id)
);
COMMENT ON TABLE community_like IS '社区点赞';

-- =========================
-- 14. 销售端/经纪人端 CRM 能力
-- =========================

CREATE TABLE IF NOT EXISTS crm_customer (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type          VARCHAR(16) NOT NULL, -- sales/broker
    owner_user_id       UUID NOT NULL REFERENCES app_user(id),
    customer_user_id    UUID REFERENCES app_user(id),
    customer_name       VARCHAR(64),
    customer_phone      VARCHAR(32),
    budget_amount       NUMERIC(14,2),
    demand_desc         TEXT,
    smart_upgrade_intent_level VARCHAR(16), -- low/medium/high
    beginner_flag       BOOLEAN NOT NULL DEFAULT FALSE,
    activity_intent_level VARCHAR(16),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_customer IS '销售/经纪人客户池';

CREATE TABLE IF NOT EXISTS crm_customer_tag (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES crm_customer(id) ON DELETE CASCADE,
    tag_id              UUID NOT NULL REFERENCES dict_tag(id) ON DELETE CASCADE,
    UNIQUE (customer_id, tag_id)
);
COMMENT ON TABLE crm_customer_tag IS '客户标签';

CREATE TABLE IF NOT EXISTS crm_interaction_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES crm_customer(id) ON DELETE CASCADE,
    interaction_type    VARCHAR(32) NOT NULL, -- chat/view/recommend/followup
    content             TEXT NOT NULL,
    related_target_type VARCHAR(32),
    related_target_id   UUID,
    created_by          UUID NOT NULL REFERENCES app_user(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_interaction_log IS '客户沟通/带看/推荐记录';

CREATE TABLE IF NOT EXISTS sales_goal (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    target_year         INT NOT NULL,
    target_month        INT,
    target_sales_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    target_upgrade_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    target_course_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    target_activity_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, target_year, target_month)
);
COMMENT ON TABLE sales_goal IS '销售个人业绩目标';

CREATE TABLE IF NOT EXISTS referral_commission_rule (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_type           VARCHAR(16) NOT NULL, -- sales/broker
    min_amount          NUMERIC(14,2) NOT NULL,
    max_amount          NUMERIC(14,2),
    base_ratio          NUMERIC(7,4) NOT NULL,
    upgrade_extra_ratio NUMERIC(7,4) NOT NULL DEFAULT 0,
    course_extra_ratio  NUMERIC(7,4) NOT NULL DEFAULT 0,
    activity_extra_ratio NUMERIC(7,4) NOT NULL DEFAULT 0
);
COMMENT ON TABLE referral_commission_rule IS '成交分红规则（销售/经纪人）';

CREATE TABLE IF NOT EXISTS referral_commission_settlement (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES trade_order(id),
    beneficiary_user_id UUID NOT NULL REFERENCES app_user(id),
    role_type           VARCHAR(16) NOT NULL,
    commission_amount   NUMERIC(14,2) NOT NULL,
    settle_status       VARCHAR(16) NOT NULL DEFAULT 'pending',
    settle_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE referral_commission_settlement IS '成交提成结算';

-- =========================
-- 15. 通知、反馈、消息
-- =========================

CREATE TABLE IF NOT EXISTS notification_message (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    msg_category        VARCHAR(32) NOT NULL, -- 系统/客服/社区/课程/活动/订单
    title               VARCHAR(255) NOT NULL,
    content             TEXT NOT NULL,
    biz_type            VARCHAR(32),
    biz_id              UUID,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE notification_message IS '消息通知中心';

CREATE TABLE IF NOT EXISTS user_notification_setting (
    user_id             UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    enable_system       BOOLEAN NOT NULL DEFAULT TRUE,
    enable_customer_srv BOOLEAN NOT NULL DEFAULT TRUE,
    enable_community    BOOLEAN NOT NULL DEFAULT TRUE,
    enable_course       BOOLEAN NOT NULL DEFAULT TRUE,
    enable_activity     BOOLEAN NOT NULL DEFAULT TRUE,
    no_disturb_from     TIME,
    no_disturb_to       TIME,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_notification_setting IS '免打扰与通知设置';

CREATE TABLE IF NOT EXISTS user_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    feedback_type       VARCHAR(32) NOT NULL, -- 功能建议/课程建议/活动建议/服务问题
    content             TEXT NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'new',
    reward_growth       INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_feedback IS '意见反馈';

-- =========================
-- 16. 核心索引
-- =========================

-- 用户/组织
CREATE INDEX IF NOT EXISTS idx_app_user_phone ON app_user(phone);
CREATE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email);
CREATE INDEX IF NOT EXISTS idx_merchant_type_status ON merchant(merchant_type, status);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_user ON merchant_staff(user_id, staff_role);
CREATE INDEX IF NOT EXISTS idx_broker_verify_status ON broker_profile(verify_status);

-- 船艇检索
CREATE INDEX IF NOT EXISTS idx_boat_listing_type_status ON boat_listing(listing_type, inventory_status);
CREATE INDEX IF NOT EXISTS idx_boat_listing_model ON boat_listing(model_id);
CREATE INDEX IF NOT EXISTS idx_boat_listing_merchant ON boat_listing(merchant_id);
CREATE INDEX IF NOT EXISTS idx_boat_listing_region ON boat_listing(region_id);
CREATE INDEX IF NOT EXISTS idx_boat_model_type_year ON boat_model(boat_type, year_released);
CREATE INDEX IF NOT EXISTS idx_boat_compare_user_time ON boat_compare_log(user_id, created_at DESC);

-- 升级检索
CREATE INDEX IF NOT EXISTS idx_upgrade_solution_type_status ON upgrade_solution(upgrade_type, status);
CREATE INDEX IF NOT EXISTS idx_upgrade_solution_merchant ON upgrade_solution(merchant_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_compat_model ON upgrade_solution_compatibility(model_id);

-- 课程与活动
CREATE INDEX IF NOT EXISTS idx_course_stage_module_form ON course(stage_level, module_type, course_form);
CREATE INDEX IF NOT EXISTS idx_course_enrollment_user ON course_enrollment(user_id, enrolled_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type_time ON merchant_activity(activity_type, start_at);
CREATE INDEX IF NOT EXISTS idx_activity_merchant_status ON merchant_activity(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_registration_user_status ON activity_registration(user_id, registration_status);

-- 商品/购物车
CREATE INDEX IF NOT EXISTS idx_product_merchant_status ON product(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_product_category_status ON product(category_id, status);
CREATE INDEX IF NOT EXISTS idx_cart_user_created ON shopping_cart_item(user_id, created_at DESC);

-- 订单交易
CREATE INDEX IF NOT EXISTS idx_trade_order_user_type_status ON trade_order(user_id, order_type, order_status);
CREATE INDEX IF NOT EXISTS idx_trade_order_merchant_created ON trade_order(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_order_sales ON trade_order(sales_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_order_broker ON trade_order(broker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_item_order ON trade_order_item(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_order_status ON payment_record(order_id, pay_status);
CREATE INDEX IF NOT EXISTS idx_refund_order_status ON refund_record(order_id, refund_status);

-- 租赁/售后
CREATE INDEX IF NOT EXISTS idx_rental_schedule_boat_time ON rental_schedule(boat_listing_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_rental_order_boat_time ON rental_order_ext(boat_listing_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_warranty_claim_user_status ON warranty_claim(user_id, claim_status);
CREATE INDEX IF NOT EXISTS idx_maintenance_order_asset_status ON maintenance_order_ext(user_boat_asset_id, service_status);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminder_time ON maintenance_reminder(remind_at, remind_status);

-- 会员分红提现
CREATE INDEX IF NOT EXISTS idx_growth_log_user_time ON growth_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bonus_settlement_user_status ON bonus_settlement(beneficiary_user_id, settle_status);
CREATE INDEX IF NOT EXISTS idx_commission_settlement_user_status ON referral_commission_settlement(beneficiary_user_id, settle_status);
CREATE INDEX IF NOT EXISTS idx_withdraw_wallet_status ON withdraw_request(wallet_id, request_status, requested_at DESC);

-- 社区/资讯
CREATE INDEX IF NOT EXISTS idx_article_type_time ON article(article_type, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_post_user_time ON community_post(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_post_activity ON community_post(related_activity_id);
CREATE INDEX IF NOT EXISTS idx_comment_post_time ON community_comment(post_id, created_at);

-- JSONB 场景索引
CREATE INDEX IF NOT EXISTS idx_upgrade_solution_params_gin ON upgrade_solution USING GIN(params_json);
CREATE INDEX IF NOT EXISTS idx_product_compatible_models_gin ON product USING GIN(compatible_models);
CREATE INDEX IF NOT EXISTS idx_trade_order_package_info_gin ON trade_order USING GIN(package_info);
