import openreview.api
import getpass
from collections import defaultdict

def build_conversation_tree(notes):
    """构建对话树结构"""
    # 按forum和replyto组织notes
    tree = defaultdict(list)
    root_notes = []
    
    for note in notes:
        if note.replyto is None:
            # 根节点（主论文或顶级评审）
            root_notes.append(note)
        else:
            # 回复节点
            tree[note.replyto].append(note)
    
    return {'roots': root_notes, 'replies': dict(tree)}

def get_note_type(note):
    """识别note的类型"""
    if not note.content:
        return "Unknown"
    
    content_keys = set(note.content.keys())
    
    # 主论文
    if 'title' in content_keys and 'authors' in content_keys and 'abstract' in content_keys:
        return "Paper"
    
    # 决定
    elif 'decision' in content_keys:
        return "Decision"
    
    # 元评审
    elif 'metareview' in content_keys:
        return "Meta Review"
    
    # 正式评审
    elif 'review' in content_keys or 'rating' in content_keys:
        return "Official Review"
    
    # 作者回应
    elif 'title' in content_keys and 'comment' in content_keys:
        title = note.content.get('title', {}).get('value', '').lower()
        if 'author' in title or 'response' in title:
            return "Author Response"
        return "Comment"
    
    # 评论
    elif 'comment' in content_keys:
        return "Comment"
    
    return "Other"

def print_conversation_tree(tree, file_handle, level=0):
    """递归打印对话树"""
    indent = "  " * level
    
    # 将根节点按类型分组
    paper_notes = []
    review_notes = []
    other_notes = []
    
    for root in tree['roots']:
        note_type = get_note_type(root)
        if note_type == "Paper":
            paper_notes.append(root)
        elif note_type == "Official Review":
            review_notes.append(root)
        else:
            other_notes.append(root)
    
    # 主论文放在最前面
    all_sorted_roots = paper_notes
    
    # 将所有非主论文的根节点合并，按时间从新到旧排序
    non_paper_notes = other_notes + review_notes
    non_paper_notes.sort(key=lambda x: x.cdate, reverse=True)
    all_sorted_roots.extend(non_paper_notes)
    
    for root in all_sorted_roots:
        note_type = get_note_type(root)
        
        # 获取签名信息
        signatures = root.signatures[0] if root.signatures else "Unknown"
        
        # 获取标题或内容摘要
        title = ""
        if root.content:
            if 'title' in root.content:
                title = root.content['title'].get('value', '')[:100]
            elif 'comment' in root.content:
                title = root.content['comment'].get('value', '')[:100]
            elif 'review' in root.content:
                title = root.content['review'].get('value', '')[:100]
        
        file_handle.write(f"{indent}[{note_type}] {signatures}\n")
        file_handle.write(f"{indent}ID: {root.id}\n")
        if title:
            file_handle.write(f"{indent}内容: {title}...\n")
        file_handle.write(f"{indent}创建时间: {root.cdate}\n")
        file_handle.write("\n")
        
        # 递归处理回复
        if root.id in tree['replies']:
            print_replies(tree['replies'][root.id], tree['replies'], file_handle, level + 1)

def print_replies(replies, all_replies, file_handle, level):
    """打印回复，根据层级使用不同的排序策略"""
    indent = "  " * level
    
    if level == 1:
        # 第一层回复（对主论文的直接回复）：按类型和时间排序
        review_replies = []
        other_replies = []
        
        for reply in replies:
            note_type = get_note_type(reply)
            if note_type == "Official Review":
                review_replies.append(reply)
            else:
                other_replies.append(reply)
        
        # 评审按时间从新到旧排序
        review_replies.sort(key=lambda x: x.cdate, reverse=True)
        
        # 其他类型（决定、元评审、评论）按时间从新到旧排序
        other_replies.sort(key=lambda x: x.cdate, reverse=True)
        
        # 先显示决定和元评审（按时间从新到旧），然后显示其他所有回复（按时间从新到旧）
        decision_and_meta = [r for r in other_replies if get_note_type(r) in ["Decision", "Meta Review"]]
        other_all = [r for r in other_replies if get_note_type(r) not in ["Decision", "Meta Review"]] + review_replies
        
        # 其他所有回复按时间从新到旧排序
        other_all.sort(key=lambda x: x.cdate, reverse=True)
        
        sorted_replies = decision_and_meta + other_all
    else:
        # 其他层级：按时间从前到后排序（对话的自然发展顺序）
        sorted_replies = sorted(replies, key=lambda x: x.cdate)
    
    for reply in sorted_replies:
        note_type = get_note_type(reply)
        signatures = reply.signatures[0] if reply.signatures else "Unknown"
        
        # 获取标题或内容摘要
        title = ""
        if reply.content:
            if 'title' in reply.content:
                title = reply.content['title'].get('value', '')[:100]
            elif 'comment' in reply.content:
                title = reply.content['comment'].get('value', '')[:100]
        
        file_handle.write(f"{indent}↳ [{note_type}] {signatures}\n")
        file_handle.write(f"{indent}  ID: {reply.id}\n")
        if title:
            file_handle.write(f"{indent}  内容: {title}...\n")
        file_handle.write(f"{indent}  创建时间: {reply.cdate}\n")
        file_handle.write("\n")
        
        # 递归处理子回复
        if reply.id in all_replies:
            print_replies(all_replies[reply.id], all_replies, file_handle, level + 1)

print("OpenReview API 测试脚本")
print("=" * 40)

forum_id = 'jCPak79Kev'

print("正在查询论文: AnalogGenie - A Generative Engine for Automatic Discovery of Analog Circuit Topologies")
print("论文链接: https://openreview.net/forum?id=jCPak79Kev")
print(f"正在查询 forum ID: {forum_id}")

try:
    # 首先尝试无认证访问
    print("\n=== 尝试无认证访问 ===")
    client = openreview.api.OpenReviewClient(baseurl='https://api2.openreview.net')
    
    # 获取主论文
    main_note = client.get_note(forum_id)
    print("✓ 成功获取主论文!")
    
    print(f"\n=== 主论文信息 ===")
    print(f"ID: {main_note.id}")
    print(f"标题: {main_note.content['title']['value']}")
    print(f"作者: {', '.join(main_note.content['authors']['value'])}")
    
    if 'abstract' in main_note.content:
        abstract = main_note.content['abstract']['value']
        print(f"摘要: {abstract[:300]}...")
    
    # 获取所有相关notes (评论、评审等)
    print(f"\n=== 获取相关notes ===")
    notes = client.get_notes(forum=forum_id)
    print(f"找到 {len(notes)} 条相关notes")
    
    # 分类显示不同类型的notes
    reviews = []
    comments = []
    main_paper = None
    
    # 分析notes的完整结构
    print(f"\n=== 分析Notes结构 ===")
    
    # 将完整的note信息输出到文件
    with open('openreview_notes_structure.txt', 'w', encoding='utf-8') as f:
        for i, note in enumerate(notes):
            f.write(f"=== Note {i+1} ===\n")
            f.write(f"ID: {note.id}\n")
            f.write(f"Forum: {note.forum}\n")
            f.write(f"ReplyTo: {note.replyto}\n")
            f.write(f"Signatures: {note.signatures}\n")
            f.write(f"Readers: {note.readers}\n")
            f.write(f"Writers: {note.writers}\n")
            f.write(f"Invitations: {note.invitations}\n")
            f.write(f"CDate: {note.cdate}\n")
            f.write(f"MDate: {note.mdate}\n")
            f.write(f"Content Keys: {list(note.content.keys()) if note.content else 'None'}\n")
            f.write(f"Content: {note.content}\n")
            f.write("\n" + "="*50 + "\n\n")
            
            print(f"已分析note ID: {note.id}")
    
    print(f"所有notes结构已保存到 openreview_notes_structure.txt 文件")
    
    # 构建对话树
    print(f"\n=== 构建对话树 ===")
    conversation_tree = build_conversation_tree(notes)
    
    # 保存对话树
    with open('openreview_conversation_tree.txt', 'w', encoding='utf-8') as f:
        f.write("OpenReview 对话树结构\n")
        f.write("=" * 50 + "\n\n")
        print_conversation_tree(conversation_tree, f)
    
    print(f"对话树已保存到 openreview_conversation_tree.txt 文件")


except Exception as e:
    print(f"无认证访问失败: {e}")
    print("\n=== 尝试认证访问 ===")
    
    try:
        # 获取用户凭据
        username = input("请输入您的 OpenReview 用户名: ")
        password = getpass.getpass("请输入您的 OpenReview 密码: ")
        
        # 创建认证客户端
        client = openreview.api.OpenReviewClient(
            baseurl='https://api2.openreview.net',
            username=username,
            password=password
        )
        
        # 重复上面的查询逻辑
        main_note = client.get_note(forum_id)
        print("✓ 认证访问成功!")
        
        print(f"\n=== 主论文信息 ===")
        print(f"ID: {main_note.id}")
        print(f"标题: {main_note.content['title']['value']}")
        print(f"作者: {', '.join(main_note.content['authors']['value'])}")
        
        notes = client.get_notes(forum=forum_id)
        print(f"\n找到 {len(notes)} 条相关notes")
        
        for i, note in enumerate(notes):
            print(f"\n--- Note {i+1} ---")
            print(f"ID: {note.id}")
            print(f"签名: {note.signatures}")
            
            if 'title' in note.content:
                print(f"类型: 主论文")
            elif 'comment' in note.content:
                print(f"类型: 评论")
                comment = note.content['comment']['value']
                print(f"评论: {comment[:200]}...")
            elif 'review' in note.content:
                print(f"类型: 评审")
                review = note.content['review']['value']
                print(f"评审: {review[:200]}...")
            
    except Exception as auth_error:
        print(f"认证访问也失败: {auth_error}")
        print("请检查您的凭据和网络连接。")